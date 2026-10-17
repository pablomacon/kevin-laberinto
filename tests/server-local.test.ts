import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { once } from "node:events";
import { Script } from "node:vm";
import { startLocalServer } from "../apps/server-local/src/server.js";
import {
  parseClientMessage,
  type ServerMessage,
} from "../packages/protocol/src/index.js";
import type { Maze } from "../packages/maze-engine/src/index.js";
const fixture: Maze = {
  id: "HIDDEN-MAZE",
  config: { columns: 20, rows: 12, seed: "HIDDEN-SEED", entranceCount: 6 },
  cells: Array.from({ length: 12 }, () =>
    Array.from({ length: 20 }, () => "floor"),
  ),
  entrances: Array.from({ length: 6 }, (_, i) => ({ column: 0, row: i * 2 })),
  kevin: { column: 12, row: 4 },
};
const sockets: WebSocket[] = [];
const servers: Awaited<ReturnType<typeof startLocalServer>>[] = [];
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  for (const server of servers.splice(0)) await server.close();
});
async function until(predicate: () => boolean): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 5000) throw new Error("WAIT_TIMEOUT");
    await new Promise((r) => setTimeout(r, 5));
  }
}
async function setup(maze: Maze | null = fixture) {
  let now = 0;
  const server = await startLocalServer({
    port: 0,
    host: "127.0.0.1",
    clock: { now: () => now },
    ...(maze ? { mazeFactory: () => maze } : {}),
  });
  servers.push(server);
  async function connect() {
    const ws = new WebSocket("ws://127.0.0.1:" + server.port + "/ws");
    sockets.push(ws);
    const messages: ServerMessage[] = [];
    ws.on("message", (data) =>
      messages.push(JSON.parse(data.toString()) as ServerMessage),
    );
    await once(ws, "open");
    let counter = 0;
    return {
      ws,
      messages,
      send: (fields: Record<string, unknown>) => {
        const messageId = "m" + ++counter;
        ws.send(JSON.stringify({ protocolVersion: 1, messageId, ...fields }));
        return messageId;
      },
      wait: async <T extends ServerMessage["type"]>(
        type: T,
        after = 0,
      ): Promise<Extract<ServerMessage, { type: T }>> => {
        await until(() => messages.slice(after).some((m) => m.type === type));
        return messages.slice(after).find((m) => m.type === type) as Extract<
          ServerMessage,
          { type: T }
        >;
      },
    };
  }
  async function player(alias: string) {
    const c = await connect();
    c.send({ type: "room.access", role: "player" });
    await c.wait("room.accessed");
    c.send({ type: "player.join", displayName: alias });
    return { ...c, joined: await c.wait("player.joined") };
  }
  async function director() {
    const c = await connect();
    c.send({
      type: "room.access",
      role: "director",
      token: server.directorToken,
    });
    await c.wait("room.accessed");
    return c;
  }
  return {
    server,
    connect,
    player,
    director,
    set: (value: number) => {
      now = value;
    },
  };
}
describe("servidor HTTP/WebSocket real", () => {
  it("comparte una carrera generada entre seis sesiones con vistas distintas", async () => {
    const app = await setup(null),
      director = await app.director();
    const players: Awaited<ReturnType<typeof app.player>>[] = [];
    for (let i = 0; i < 6; i++) players.push(await app.player("Real " + i));
    const states = director.messages.filter(
      (m) => m.type === "broadcast.state",
    );
    const full = states.at(-1)!.state;
    expect(full.maze.config.columns).toBe(80);
    expect(full.maze.config.rows).toBe(45);
    expect(new Set(players.map((p) => p.joined.matchId))).toEqual(
      new Set([full.summary.matchId]),
    );
    const views = await Promise.all(players.map((p) => p.wait("player.view")));
    expect(new Set(views.map((m) => JSON.stringify(m.view.visible))).size).toBe(
      6,
    );
    for (const { view } of views) {
      expect(view).not.toHaveProperty("kevin");
      for (const cell of view.explored)
        expect(cell.terrain).toBe(full.maze.cells[cell.row]![cell.column]);
    }
  }, 15000);
  it("conecta seis clientes, autoriza director/OBS y evita filtraciones", async () => {
    const app = await setup(),
      director = await app.director();
    const players: Awaited<ReturnType<typeof app.player>>[] = [];
    for (let i = 0; i < 6; i++) players.push(await app.player("P" + i));
    expect(new Set(players.map((p) => p.joined.participantId)).size).toBe(6);
    const spectator = await app.connect();
    spectator.send({ type: "room.access", role: "player" });
    await spectator.wait("room.accessed");
    spectator.send({ type: "player.join", displayName: "Séptimo" });
    expect((await spectator.wait("error")).code).toBe("ROOM_FULL");
    const before = players[0]!.messages.length;
    director.send({ type: "admin.start" });
    await players[0]!.wait("match.status", before);
    app.set(3000);
    players[0]!.send({ type: "player.move", direction: "right", sequence: 0 });
    players[1]!.send({ type: "player.move", direction: "right", sequence: 0 });
    await until(() =>
      players
        .slice(0, 2)
        .every((p) =>
          p.messages.some(
            (m) => m.type === "player.view" && m.view.position.column === 1,
          ),
        ),
    );
    for (const p of players) {
      const wire = JSON.stringify(p.messages);
      expect(wire).not.toContain("HIDDEN-SEED");
      expect(wire).not.toContain("HIDDEN-MAZE");
      expect(p.messages.some((m) => m.type === "broadcast.state")).toBe(false);
      const view = (await p.wait("player.view")).view;
      expect(view).not.toHaveProperty("kevin");
      expect(view).not.toHaveProperty("positions");
      expect(view).not.toHaveProperty("maze");
      expect(view.explored.length).toBeLessThan(240);
    }
    const observer = await app.connect();
    observer.send({
      type: "room.access",
      role: "broadcast",
      token: app.server.broadcastToken,
    });
    expect((await observer.wait("broadcast.state")).state.maze.id).toBe(
      "HIDDEN-MAZE",
    );
    observer.send({ type: "admin.start" });
    expect((await observer.wait("error")).code).toBe("FORBIDDEN");
    const attack = await app.connect();
    attack.send({
      type: "room.access",
      role: "director",
      token: "x".repeat(43),
    });
    expect((await attack.wait("error")).code).toBe("UNAUTHORIZED");
    const marker = spectator.messages.length;
    spectator.send({ type: "admin.start" });
    expect((await spectator.wait("error", marker)).code).toBe("FORBIDDEN");
    const html = await (
      await fetch("http://127.0.0.1:" + app.server.port + "/admin")
    ).text();
    expect(html).not.toContain(app.server.directorToken);
    const response = await fetch(
      "http://127.0.0.1:" + app.server.port + "/play",
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "ws://127.0.0.1:" + app.server.port,
    );
    const js = await (
      await fetch("http://127.0.0.1:" + app.server.port + "/beta-client.js")
    ).text();
    expect(js).toContain("WebSocket");
    expect(js).not.toContain("crypto.randomUUID");
    expect(() => new Script(js)).not.toThrow();
  });
  it("reconecta una sesión, mantiene secuencias, agota tiempo y reinicia", async () => {
    const app = await setup(),
      director = await app.director();
    const players: Awaited<ReturnType<typeof app.player>>[] = [];
    for (let i = 0; i < 3; i++) players.push(await app.player("P" + i));
    director.send({ type: "admin.start" });
    await until(() =>
      players[0]!.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "countdown",
      ),
    );
    app.set(3000);
    const p = players[0]!;
    p.send({ type: "player.move", direction: "right", sequence: 5 });
    await until(() =>
      p.messages.some(
        (m) => m.type === "player.view" && m.view.position.column === 1,
      ),
    );
    p.ws.close();
    await once(p.ws, "close");
    await until(() =>
      director.messages.some(
        (m) =>
          m.type === "broadcast.state" &&
          m.state.summary.participants.some(
            (v) => v.id === p.joined.participantId && !v.connected,
          ),
      ),
    );
    app.set(32000);
    const re = await app.connect();
    re.send({ type: "room.access", role: "player" });
    await re.wait("room.accessed");
    re.send({ type: "player.reconnect", token: p.joined.reconnectToken });
    const joined = await re.wait("player.joined");
    expect(joined.participantId).toBe(p.joined.participantId);
    expect(joined.nextSequence).toBe(6);
    re.send({ type: "player.move", direction: "right", sequence: 5 });
    expect((await re.wait("error")).code).toBe("DUPLICATE_SEQUENCE");
    const expired = players[1]!;
    expired.ws.close();
    await once(expired.ws, "close");
    await until(() =>
      director.messages.some(
        (m) =>
          m.type === "broadcast.state" &&
          m.state.summary.participants.some(
            (v) => v.id === expired.joined.participantId && !v.connected,
          ),
      ),
    );
    app.set(62001);
    const late = await app.connect();
    late.send({ type: "room.access", role: "player" });
    await late.wait("room.accessed");
    late.send({
      type: "player.reconnect",
      token: expired.joined.reconnectToken,
    });
    expect(["INVALID_SESSION", "RECONNECT_EXPIRED"]).toContain(
      (await late.wait("error")).code,
    );
    app.set(243000);
    const finish = await re.wait("match.finished");
    expect(finish.status).not.toHaveProperty("winnerId");
    expect(finish.status.results).toHaveLength(3);
    const marker = re.messages.length;
    director.send({ type: "room.create" });
    await until(() =>
      re.messages
        .slice(marker)
        .some(
          (m) =>
            m.type === "match.status" &&
            m.status.phase === "waiting" &&
            m.status.participants.length === 0,
        ),
    );
    re.send({ type: "player.reconnect", token: p.joined.reconnectToken });
    expect((await re.wait("error", marker)).code).toBe("INVALID_SESSION");
  });
  it("resuelve llegada y ganador mediante órdenes reales y rechaza mensajes manipulados", async () => {
    const app = await setup({
        ...fixture,
        kevin: { column: 1, row: 1 },
        entrances: [
          { column: 0, row: 1 },
          { column: 2, row: 1 },
          ...fixture.entrances.slice(2),
        ],
      }),
      director = await app.director();
    const players: Awaited<ReturnType<typeof app.player>>[] = [];
    for (let i = 0; i < 3; i++) players.push(await app.player("P" + i));
    director.send({ type: "admin.start" });
    await until(() =>
      players[0]!.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "countdown",
      ),
    );
    app.set(3000);
    const first = players[0]!,
      second = players[1]!;
    first.send({ type: "player.move", direction: "right", sequence: 0 });
    expect((await first.wait("match.finished")).status.winnerId).toBe(
      first.joined.participantId,
    );
    second.send({ type: "player.move", direction: "left", sequence: 0 });
    expect((await second.wait("error")).code).toBe("NOT_RUNNING");
    const marker = first.messages.length;
    first.send({
      type: "player.move",
      direction: "right",
      sequence: 1,
      position: { column: 1, row: 1 },
    });
    expect((await first.wait("error", marker)).code).toBe("INVALID_MESSAGE");
    const id = first.send({ type: "room.create" });
    const mark = first.messages.length;
    first.send({ type: "room.create", messageId: id });
    await until(() =>
      first.messages
        .slice(mark)
        .some((m) => m.type === "error" && m.code === "DUPLICATE_MESSAGE"),
    );
  });
  it("valida estrictamente el protocolo en tiempo de ejecución", () => {
    for (const payload of [
      null,
      [],
      {},
      { type: "toString" },
      { type: "player.move", direction: "diagonal", sequence: 0 },
      { type: "player.move", direction: "up", sequence: 0.5 },
      { type: "player.join", displayName: "\n" },
      { type: "admin.start", winnerId: "fake" },
    ])
      expect(
        parseClientMessage({
          protocolVersion: 1,
          messageId: "test",
          ...payload,
        }),
      ).toBeNull();
    expect(
      parseClientMessage({
        protocolVersion: 1,
        messageId: "ok",
        type: "player.move",
        direction: "left",
        sequence: 0,
      }),
    ).not.toBeNull();
  });
});
