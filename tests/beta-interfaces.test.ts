import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { once } from "node:events";
import { startLocalServer } from "../apps/server-local/src/server.js";
import type { ServerMessage } from "../packages/protocol/src/index.js";
import type { Maze } from "../packages/maze-engine/src/index.js";

const testMaze: Maze = {
  id: "BETA-TEST-MAZE",
  config: { columns: 25, rows: 15, seed: "BETA-SEED", entranceCount: 6 },
  cells: Array.from({ length: 15 }, () =>
    Array.from({ length: 25 }, () => "floor" as const),
  ),
  entrances: [
    { column: 0, row: 0 },
    { column: 0, row: 2 },
    { column: 0, row: 4 },
    { column: 0, row: 6 },
    { column: 0, row: 8 },
    { column: 0, row: 10 },
  ],
  kevin: { column: 5, row: 0 },
};

const sockets: WebSocket[] = [];
const servers: Awaited<ReturnType<typeof startLocalServer>>[] = [];

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  for (const server of servers.splice(0)) await server.close();
});

async function until(
  predicate: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("WAIT_TIMEOUT");
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function setupTestApp(maze: Maze = testMaze) {
  let virtualTime = 0;
  const server = await startLocalServer({
    port: 0,
    host: "127.0.0.1",
    clock: { now: () => virtualTime },
    mazeFactory: () => maze,
  });
  servers.push(server);

  async function connectClient() {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
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
        const messageId = "msg-" + ++counter;
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

  async function createPlayer(name: string) {
    const c = await connectClient();
    c.send({ type: "room.access", role: "player" });
    await c.wait("room.accessed");
    c.send({ type: "player.join", displayName: name });
    const joined = await c.wait("player.joined");
    return { ...c, joined };
  }

  async function createDirector() {
    const c = await connectClient();
    c.send({
      type: "room.access",
      role: "director",
      token: server.directorToken,
    });
    await c.wait("room.accessed");
    return c;
  }

  async function createBroadcast() {
    const c = await connectClient();
    c.send({
      type: "room.access",
      role: "broadcast",
      token: server.broadcastToken,
    });
    await c.wait("room.accessed");
    return c;
  }

  return {
    server,
    setTime: (ms: number) => {
      virtualTime = ms;
    },
    advanceTime: (deltaMs: number) => {
      virtualTime += deltaMs;
    },
    connectClient,
    createPlayer,
    createDirector,
    createBroadcast,
  };
}

describe("KEL-005 — Pruebas de integración de interfaces multijugador", () => {
  it("admite 3 y 6 jugadores, validando límites y arranque con director", async () => {
    const app = await setupTestApp();
    const director = await app.createDirector();

    // Con menos de 3 jugadores, el inicio de partida es rechazado con NOT_READY
    const p1 = await app.createPlayer("Estudiante 1");
    await app.createPlayer("Estudiante 2");

    director.send({ type: "admin.start" });
    const err = await director.wait("error");
    expect(err.code).toBe("NOT_READY");

    // Al sumarse el 3er jugador, el director puede iniciar
    await app.createPlayer("Estudiante 3");
    const marker = p1.messages.length;
    director.send({ type: "admin.start" });

    const status1 = await p1.wait("match.status", marker);
    expect(status1.status.phase).toBe("countdown");
    expect(status1.status.participants).toHaveLength(3);
  });

  it("admite 6 jugadores simultáneos y rechaza un 7mo con ROOM_FULL", async () => {
    const app = await setupTestApp();
    const players: Awaited<ReturnType<typeof app.createPlayer>>[] = [];

    for (let i = 1; i <= 6; i++) {
      players.push(await app.createPlayer(`Jugador ${i}`));
    }
    expect(players).toHaveLength(6);

    const c7 = await app.connectClient();
    c7.send({ type: "room.access", role: "player" });
    await c7.wait("room.accessed");
    c7.send({ type: "player.join", displayName: "Excedente" });
    const err = await c7.wait("error");
    expect(err.code).toBe("ROOM_FULL");
  });

  it("garantiza la privacidad estricta de las vistas privadas: sin posiciones rivales y Kevin oculto fuera de linterna", async () => {
    const app = await setupTestApp();
    const director = await app.createDirector();
    const p1 = await app.createPlayer("Alice");
    const p2 = await app.createPlayer("Bob");
    await app.createPlayer("Charlie");

    director.send({ type: "admin.start" });
    await until(() =>
      p1.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "countdown",
      ),
    );
    app.setTime(3000);
    await until(() =>
      p1.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "running",
      ),
    );

    // Enviar primer movimiento válido para actualizar vista en carrera
    app.advanceTime(200);
    p1.send({ type: "player.move", direction: "right", sequence: 0 });
    await until(() =>
      p1.messages.some(
        (m) => m.type === "player.view" && m.view.position.column === 1,
      ),
    );

    const view1 = p1.messages
      .filter((m) => m.type === "player.view")
      .at(-1)!.view;

    // 1. La vista no contiene ninguna propiedad con posiciones de rivales
    expect(view1).not.toHaveProperty("positions");
    expect(view1).not.toHaveProperty("players");
    expect(view1).not.toHaveProperty("rivals");

    // 2. Alice está en (1, 0). Kevin está en (5, 0).
    // Distancia Euclidiana: 4 casillas. Radius es 4.
    // Probemos con Bob en (0, 2): distancia a Kevin (5, 0) es sqrt(25+4) > 4
    app.advanceTime(200);
    p2.send({ type: "player.move", direction: "right", sequence: 0 });
    await until(() =>
      p2.messages.some(
        (m) => m.type === "player.view" && m.view.position.column === 1,
      ),
    );
    const view2 = p2.messages
      .filter((m) => m.type === "player.view")
      .at(-1)!.view;
    expect(view2.kevin).toBeUndefined();
  });

  it("procesa movimientos simultáneos e independientes con secuencias monótonas", async () => {
    const app = await setupTestApp();
    const director = await app.createDirector();
    const p1 = await app.createPlayer("P1");
    const p2 = await app.createPlayer("P2");
    await app.createPlayer("P3");

    director.send({ type: "admin.start" });
    await until(() =>
      p1.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "countdown",
      ),
    );
    app.setTime(3000);
    await until(() =>
      p1.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "running",
      ),
    );

    let p1Seq = 0;
    let p2Seq = 0;

    app.advanceTime(200);
    p1.send({ type: "player.move", direction: "right", sequence: p1Seq++ });
    p2.send({ type: "player.move", direction: "right", sequence: p2Seq++ });

    await until(() => {
      const v1 = p1.messages.filter((m) => m.type === "player.view").at(-1);
      const v2 = p2.messages.filter((m) => m.type === "player.view").at(-1);
      return (
        v1?.type === "player.view" &&
        v1.view.position.column === 1 &&
        v2?.type === "player.view" &&
        v2.view.position.column === 1
      );
    });

    app.advanceTime(200);
    p1.send({ type: "player.move", direction: "right", sequence: p1Seq++ });
    p2.send({ type: "player.move", direction: "right", sequence: p2Seq++ });

    await until(() => {
      const v1 = p1.messages.filter((m) => m.type === "player.view").at(-1);
      const v2 = p2.messages.filter((m) => m.type === "player.view").at(-1);
      return (
        v1?.type === "player.view" &&
        v1.view.position.column === 2 &&
        v2?.type === "player.view" &&
        v2.view.position.column === 2
      );
    });
  });

  it("detecta encuentro físico con Kevin y corona al ganador", async () => {
    const app = await setupTestApp();
    const director = await app.createDirector();
    const obs = await app.createBroadcast();

    const p1 = await app.createPlayer("Corredor 1");
    const p2 = await app.createPlayer("Corredor 2");
    await app.createPlayer("Corredor 3");

    director.send({ type: "admin.start" });
    await until(() =>
      p1.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "countdown",
      ),
    );
    app.setTime(3000);
    await until(() =>
      p1.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "running",
      ),
    );

    // P1 está en (0, 0), Kevin en (5, 0).
    // Avanzar paso a paso esperando confirmación
    for (let step = 0; step < 5; step++) {
      app.advanceTime(200);
      p1.send({ type: "player.move", direction: "right", sequence: step });
      if (step < 4) {
        await until(() =>
          p1.messages.some(
            (m) =>
              m.type === "player.view" && m.view.position.column === step + 1,
          ),
        );
      }
    }

    const finishedP1 = await p1.wait("match.finished");
    expect(finishedP1.status.phase).toBe("finished");
    expect(finishedP1.status.winnerId).toBe(p1.joined.participantId);

    const finishedP2 = await p2.wait("match.finished");
    expect(finishedP2.status.winnerId).toBe(p1.joined.participantId);

    const lastObsState = obs.messages
      .filter((m) => m.type === "broadcast.state")
      .at(-1)!;
    expect(lastObsState.state.summary.phase).toBe("finished");
    expect(lastObsState.state.summary.winnerId).toBe(p1.joined.participantId);
  });

  it("finaliza la partida sin ganador cuando se agota el tiempo límite", async () => {
    const app = await setupTestApp();
    const director = await app.createDirector();

    await app.createPlayer("Lento 1");
    await app.createPlayer("Lento 2");
    const p3 = await app.createPlayer("Lento 3");

    director.send({ type: "admin.start" });
    await until(() =>
      p3.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "countdown",
      ),
    );
    app.setTime(3000);
    await until(() =>
      p3.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "running",
      ),
    );

    // Duración de carrera por defecto: 240s (240000ms). Con countdown (3000ms) = 243001ms
    app.setTime(243001);

    const finished = await p3.wait("match.finished");
    expect(finished.status.phase).toBe("finished");
    expect(finished.status.winnerId).toBeUndefined();
    expect(finished.status.results).toHaveLength(3);
  });

  it("permite reconectar a un jugador manteniendo su posición y secuencia", async () => {
    const app = await setupTestApp();
    const director = await app.createDirector();

    const p1 = await app.createPlayer("Desconectado");
    await app.createPlayer("Rival A");
    await app.createPlayer("Rival B");

    director.send({ type: "admin.start" });
    await until(() =>
      p1.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "countdown",
      ),
    );
    app.setTime(3000);
    await until(() =>
      p1.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "running",
      ),
    );

    app.advanceTime(200);
    p1.send({ type: "player.move", direction: "right", sequence: 0 });
    await until(() =>
      p1.messages.some(
        (m) => m.type === "player.view" && m.view.position.column === 1,
      ),
    );

    // Desconectar p1
    p1.ws.close();
    await once(p1.ws, "close");

    // Reconectar con token guardado
    const reconnectClient = await app.connectClient();
    reconnectClient.send({ type: "room.access", role: "player" });
    await reconnectClient.wait("room.accessed");

    reconnectClient.send({
      type: "player.reconnect",
      token: p1.joined.reconnectToken,
    });

    const reconnected = await reconnectClient.wait("player.joined");
    expect(reconnected.participantId).toBe(p1.joined.participantId);
    expect(reconnected.nextSequence).toBe(1);

    // Restaurar vista y enviar siguiente movimiento con sequence = 1
    app.advanceTime(200);
    reconnectClient.send({
      type: "player.move",
      direction: "right",
      sequence: 1,
    });
    await until(() =>
      reconnectClient.messages.some(
        (m) => m.type === "player.view" && m.view.position.column === 2,
      ),
    );
  });

  it("permite al director reiniciar la sala (room.create) para una nueva partida", async () => {
    const app = await setupTestApp();
    const director = await app.createDirector();

    const p1 = await app.createPlayer("Jugador 1");
    await app.createPlayer("Jugador 2");
    await app.createPlayer("Jugador 3");

    const initialMatchId = p1.joined.matchId;

    director.send({ type: "room.create" });

    const newStatus = await p1.wait("match.status", p1.messages.length - 1);
    expect(newStatus.status.matchId).not.toBe(initialMatchId);
    expect(newStatus.status.phase).toBe("waiting");
    expect(newStatus.status.participants).toHaveLength(0);
  });

  it("transmite a OBS el estado global en tiempo real y rechaza conexiones sin token válido", async () => {
    const app = await setupTestApp();
    const director = await app.createDirector();

    // 1. Intento sin token rechazado
    const unauthorizedObs = await app.connectClient();
    unauthorizedObs.send({ type: "room.access", role: "broadcast" });
    const err = await unauthorizedObs.wait("error");
    expect(err.code).toBe("UNAUTHORIZED");

    // 2. Conexión autorizada
    const authorizedObs = await app.createBroadcast();

    await app.createPlayer("P1");
    await app.createPlayer("P2");
    await app.createPlayer("P3");

    const marker = authorizedObs.messages.length;
    director.send({ type: "admin.start" });

    await until(() =>
      authorizedObs.messages
        .slice(marker)
        .some(
          (m) =>
            m.type === "broadcast.state" &&
            m.state.summary.phase === "countdown" &&
            m.state.positions.length === 3,
        ),
    );

    const broadcastMsg = authorizedObs.messages
      .filter((m) => m.type === "broadcast.state")
      .at(-1)!;
    expect(broadcastMsg.state.maze.config.columns).toBe(25);
    expect(broadcastMsg.state.positions).toHaveLength(3);
    expect(broadcastMsg.state.maze.kevin).toEqual({ column: 5, row: 0 });
  });

  it("rechaza controles de director si son emitidos por jugadores no autorizados", async () => {
    const app = await setupTestApp();
    const player = await app.createPlayer("Hacker");

    player.send({ type: "admin.start" });
    const err1 = await player.wait("error");
    expect(err1.code).toBe("FORBIDDEN");

    player.send({ type: "room.create" });
    const err2 = await player.wait("error", player.messages.length - 1);
    expect(err2.code).toBe("FORBIDDEN");
  });
});
