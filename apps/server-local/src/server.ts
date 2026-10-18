import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { hostname, networkInterfaces } from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import { generateMaze, type Maze } from "@kevin/maze-engine";
import {
  MatchEngine,
  MatchError,
  type Clock,
  type MatchConfig,
} from "@kevin/game-core";
import { parseClientMessage, type ServerMessage } from "@kevin/protocol";
import { page, browserClient, browserStyles } from "./pages.js";

export interface ServerOptions {
  port?: number;
  host?: string;
  clock?: Clock;
  matchConfig?: Partial<MatchConfig>;
  mazeFactory?: () => Maze;
  webRoot?: string;
}
interface Session {
  id: string;
  token: string;
  lastSequence: number;
  socket: WebSocket | null;
  disconnectedAt: number | null;
}
interface Connection {
  role: "player" | "director" | "broadcast" | null;
  participantId: string | null;
  seen: Set<string>;
  rateStart: number;
  count: number;
}
export async function startLocalServer(options: ServerOptions = {}) {
  const clock = options.clock ?? { now: () => performance.now() };
  const capability = () => randomBytes(32).toString("base64url");
  const directorToken = capability(),
    broadcastToken = capability();
  const factory =
    options.mazeFactory ??
    (() => {
      const result = generateMaze({
        columns: 80,
        rows: 45,
        entranceCount: 6,
        seed: capability(),
      });
      if ("code" in result) throw new Error(JSON.stringify(result));
      return result.maze;
    });
  const makeMatch = () =>
    new MatchEngine(randomUUID(), factory(), clock, options.matchConfig);
  let engine = makeMatch();
  const sessions = new Map<string, Session>(),
    connections = new Map<WebSocket, Connection>();
  const equal = (a: string, b: string): boolean => {
    const left = Buffer.from(a),
      right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  };
  const allowedHosts = new Set([
    "localhost",
    "127.0.0.1",
    "[::1]",
    hostname().toLowerCase(),
    ...Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .map((address) =>
        address.family === "IPv6"
          ? "[" + address.address + "]"
          : address.address,
      ),
  ]);
  function validHost(host: string | undefined): boolean {
    try {
      return allowedHosts.has(new URL("http://" + host).hostname.toLowerCase());
    } catch {
      return false;
    }
  }
  const server: Server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; connect-src 'self' ws://" +
        (validHost(req.headers.host)
          ? new URL("http://" + req.headers.host).host
          : "localhost") +
        "; style-src 'self'",
    );
    if (!validHost(req.headers.host)) {
      res.writeHead(403).end();
      return;
    }
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    if (["/", "/play", "/admin", "/broadcast"].includes(path)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(page(path));
      return;
    }
    if (path === "/beta-client.js") {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.end(browserClient);
      return;
    }
    if (path === "/beta.css") {
      res.setHeader("Content-Type", "text/css; charset=utf-8");
      res.end(browserStyles);
      return;
    }
    if (path === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    // El laboratorio compilado es independiente y se sirve bajo /lab; nunca recibe capacidades.
    if (options.webRoot && (path === "/lab" || path.startsWith("/lab/"))) {
      try {
        const root = resolve(options.webRoot),
          relative = decodeURIComponent(path.slice(5) || "index.html"),
          file = resolve(root, relative);
        if (!file.startsWith(root + sep)) {
          res.writeHead(403).end();
          return;
        }
        const data = await readFile(file);
        const types: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript",
          ".css": "text/css",
          ".png": "image/png",
        };
        res.setHeader(
          "Content-Type",
          types[extname(file)] ?? "application/octet-stream",
        );
        res.end(
          extname(file) === ".html"
            ? data.toString().replaceAll('"/assets/', '"/lab/assets/')
            : data,
        );
      } catch {
        res.writeHead(404).end();
      }
      return;
    }
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const alive = new Set<WebSocket>();
  server.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin;
    let permitted = validHost(req.headers.host) && req.url === "/ws";
    if (origin) {
      try {
        permitted =
          permitted &&
          new URL(origin).host === req.headers.host &&
          new URL(origin).protocol === "http:";
      } catch {
        permitted = false;
      }
    }
    if (!permitted) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  const send = (
    ws: WebSocket,
    payload: Omit<ServerMessage, "protocolVersion" | "messageId">,
  ): void => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 2_000_000) {
      ws.close(1013, "Cliente lento");
      return;
    }
    ws.send(
      JSON.stringify({
        ...payload,
        protocolVersion: 1,
        messageId: randomUUID(),
      }),
    );
  };
  const error = (ws: WebSocket, code: string, requestId?: string): void =>
    send(ws, {
      type: "error",
      code,
      message: code,
      ...(requestId ? { requestId } : {}),
    } as ServerMessage);
  const publish = (views = true): void => {
    const status = engine.summary();
    for (const [ws, ctx] of connections) {
      if (!ctx.role) continue;
      if (ctx.role === "director" || ctx.role === "broadcast") {
        send(ws, {
          type: "broadcast.state",
          state: engine.fullState(),
        } as ServerMessage);
        continue;
      }
      send(ws, {
        type: status.phase === "finished" ? "match.finished" : "match.status",
        status,
      } as ServerMessage);
      if (views && ctx.participantId) {
        try {
          send(ws, {
            type: "player.view",
            view: engine.view(ctx.participantId),
          } as ServerMessage);
        } catch {
          ctx.participantId = null;
        }
      }
    }
  };
  wss.on("connection", (ws) => {
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    const ctx: Connection = {
      role: null,
      participantId: null,
      seen: new Set(),
      rateStart: clock.now(),
      count: 0,
    };
    connections.set(ws, ctx);
    ws.on("error", () => {
      /* close gestiona la sesión; no exponer errores de transporte. */
    });
    ws.on("message", (raw, binary) => {
      let requestId: string | undefined;
      try {
        if (clock.now() - ctx.rateStart >= 1000) {
          ctx.count = 0;
          ctx.rateStart = clock.now();
        }
        if (++ctx.count > 80) {
          ws.close(1008, "RATE_LIMIT");
          return;
        }
        if (binary) throw new MatchError("INVALID_MESSAGE");
        let decoded: unknown;
        try {
          decoded = JSON.parse(raw.toString());
        } catch {
          throw new MatchError("INVALID_JSON");
        }
        const message = parseClientMessage(decoded);
        if (!message) throw new MatchError("INVALID_MESSAGE");
        requestId = message.messageId;
        if (ctx.seen.has(message.messageId))
          throw new MatchError("DUPLICATE_MESSAGE");
        if (ctx.seen.size >= 4096) {
          ws.close(1008, "RECONNECT_REQUIRED");
          return;
        }
        ctx.seen.add(message.messageId);
        if (message.type === "room.access") {
          if (ctx.role) throw new MatchError("ALREADY_AUTHORIZED");
          if (
            message.role !== "player" &&
            !equal(
              message.token ?? "",
              message.role === "director" ? directorToken : broadcastToken,
            )
          )
            throw new MatchError("UNAUTHORIZED");
          ctx.role = message.role;
          send(ws, { type: "room.accessed", role: ctx.role } as ServerMessage);
          publish();
          return;
        }
        if (!ctx.role) throw new MatchError("UNAUTHORIZED");
        switch (message.type) {
          case "player.join": {
            if (ctx.role !== "player") throw new MatchError("FORBIDDEN");
            if (ctx.participantId) throw new MatchError("ALREADY_JOINED");
            const id = randomUUID(),
              token = capability();
            engine.join(id, message.displayName.trim());
            ctx.participantId = id;
            sessions.set(token, {
              id,
              token,
              lastSequence: -1,
              socket: ws,
              disconnectedAt: null,
            });
            send(ws, {
              type: "player.joined",
              participantId: id,
              reconnectToken: token,
              nextSequence: 0,
              matchId: engine.matchId,
            } as ServerMessage);
            break;
          }
          case "player.reconnect": {
            if (ctx.role !== "player" || ctx.participantId)
              throw new MatchError("FORBIDDEN");
            const session = sessions.get(message.token);
            if (!session) throw new MatchError("INVALID_SESSION");
            if (session.socket) throw new MatchError("ALREADY_CONNECTED");
            engine.reconnect(session.id);
            session.socket = ws;
            session.disconnectedAt = null;
            ctx.participantId = session.id;
            send(ws, {
              type: "player.joined",
              participantId: session.id,
              reconnectToken: session.token,
              nextSequence: session.lastSequence + 1,
              matchId: engine.matchId,
            } as ServerMessage);
            break;
          }
          case "player.move": {
            if (ctx.role !== "player" || !ctx.participantId)
              throw new MatchError("FORBIDDEN");
            const session = [...sessions.values()].find(
              (s) => s.id === ctx.participantId,
            )!;
            if (message.sequence <= session.lastSequence)
              throw new MatchError("DUPLICATE_SEQUENCE");
            session.lastSequence = message.sequence;
            engine.move(session.id, message.direction);
            break;
          }
          case "admin.start":
            if (ctx.role !== "director") throw new MatchError("FORBIDDEN");
            engine.start();
            break;
          case "room.create": {
            if (ctx.role !== "director") throw new MatchError("FORBIDDEN");
            const next = makeMatch();
            engine = next;
            sessions.clear();
            for (const c of connections.values()) c.participantId = null;
            break;
          }
        }
        publish();
      } catch (e) {
        error(
          ws,
          e instanceof MatchError ? e.code : "INTERNAL_ERROR",
          requestId,
        );
      }
    });
    ws.on("close", () => {
      connections.delete(ws);
      alive.delete(ws);
      const session = [...sessions.values()].find((s) => s.socket === ws);
      if (session) {
        session.socket = null;
        session.disconnectedAt = clock.now();
        try {
          engine.disconnect(session.id);
        } catch {
          /* Partida reiniciada. */
        }
      }
      publish();
    });
  });
  const timer = setInterval(() => {
    engine.tick();
    for (const [token, session] of sessions)
      if (
        session.disconnectedAt !== null &&
        clock.now() - session.disconnectedAt >=
          engine.config.reconnectionGraceSeconds * 1000
      )
        sessions.delete(token);
    publish(false);
  }, 250);
  timer.unref();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, 5000);
  heartbeat.unref();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 3000, options.host ?? "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("LISTEN_FAILED");
  return {
    port: address.port,
    directorToken,
    broadcastToken,
    server,
    close: async () => {
      clearInterval(timer);
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    },
  };
}
