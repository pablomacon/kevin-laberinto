import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { once } from "node:events";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import type { ServerMessage } from "../packages/protocol/src/index.js";
const reservation = createServer();
reservation.listen(0, "0.0.0.0");
await once(reservation, "listening");
const address = reservation.address();
if (!address || typeof address === "string") throw new Error("No hay puerto");
const port = address.port;
await new Promise<void>((r) => reservation.close(() => r()));
const host =
  Object.values(networkInterfaces())
    .flatMap((v) => v ?? [])
    .find((v) => v.family === "IPv4" && !v.internal)?.address ?? "127.0.0.1";
const child = spawn(
  process.execPath,
  ["--import", "tsx", "apps/server-local/src/index.ts"],
  {
    env: { ...process.env, PORT: String(port) },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let stdout = "",
  stderr = "";
child.stdout.on("data", (v) => (stdout += String(v)));
child.stderr.on("data", (v) => (stderr += String(v)));
child.on("error", (error) => {
  stderr += error.message;
});
const sockets: WebSocket[] = [];
async function until(predicate: () => boolean) {
  const start = Date.now();
  while (!predicate()) {
    if (child.exitCode !== null)
      throw new Error("El servidor terminó durante el smoke: " + stderr);
    if (Date.now() - start > 15000)
      throw new Error("Timeout del arranque/partida: " + stderr);
    await new Promise((r) => setTimeout(r, 20));
  }
}
async function connect(role: "player" | "director", token?: string) {
  const socket = new WebSocket(`ws://${host}:${port}/ws`);
  sockets.push(socket);
  const messages: ServerMessage[] = [];
  socket.on("message", (data) =>
    messages.push(JSON.parse(data.toString()) as ServerMessage),
  );
  await once(socket, "open");
  let id = 0;
  const send = (fields: Record<string, unknown>) =>
    socket.send(
      JSON.stringify({ protocolVersion: 1, messageId: "s" + ++id, ...fields }),
    );
  send({ type: "room.access", role, ...(token ? { token } : {}) });
  await until(() => messages.some((m) => m.type === "room.accessed"));
  return { send, messages };
}
try {
  await until(() => stdout.includes("OBS: "));
  const base = `http://${host}:${port}`;
  for (const route of ["/health", "/play", "/admin", "/broadcast", "/lab/"])
    assert.equal((await fetch(base + route)).status, 200, route);
  const lab = await (await fetch(base + "/lab/")).text(),
    asset = lab.match(/src="([^"]+\.js)"/)?.[1];
  assert(asset);
  assert.equal(
    (await fetch(base + asset)).status,
    200,
    "asset del laboratorio",
  );
  const directorToken = stdout.match(/\/admin#([A-Za-z0-9_-]+)/)?.[1];
  assert(directorToken);
  const director = await connect("director", directorToken),
    players: Awaited<ReturnType<typeof connect>>[] = [];
  for (let i = 0; i < 6; i++) {
    const client = await connect("player");
    client.send({ type: "player.join", displayName: "Smoke " + i });
    await until(() => client.messages.some((m) => m.type === "player.joined"));
    players.push(client);
  }
  director.send({ type: "admin.start" });
  await until(() =>
    players.every((p) =>
      p.messages.some(
        (m) => m.type === "match.status" && m.status.phase === "running",
      ),
    ),
  );
  for (const player of players) {
    assert(!player.messages.some((m) => m.type === "broadcast.state"));
    const view = player.messages.find((m) => m.type === "player.view")!;
    assert(!("kevin" in view.view));
  }
  const first = players[0]!,
    view = first.messages.filter((m) => m.type === "player.view").at(-1)!.view;
  const step = (
    [
      { direction: "up", dx: 0, dy: -1 },
      { direction: "down", dx: 0, dy: 1 },
      { direction: "left", dx: -1, dy: 0 },
      { direction: "right", dx: 1, dy: 0 },
    ] as const
  ).find((d) =>
    view.visible.some(
      (p) =>
        p.terrain === "floor" &&
        p.column === view.position.column + d.dx &&
        p.row === view.position.row + d.dy,
    ),
  )!;
  const marker = first.messages.length;
  first.send({ type: "player.move", direction: step.direction, sequence: 0 });
  await until(() =>
    first.messages
      .slice(marker)
      .some(
        (m) =>
          m.type === "player.view" &&
          (m.view.position.column !== view.position.column ||
            m.view.position.row !== view.position.row),
      ),
  );
  console.log(
    JSON.stringify({
      startup: "CLI",
      host,
      port,
      clients: 6,
      phase: "running",
      http: true,
      labAssets: true,
      privateViews: true,
      authoritativeMove: true,
    }),
  );
} finally {
  for (const ws of sockets) ws.terminate();
  if (child.pid && child.exitCode === null && child.signalCode === null) {
    child.kill();
    await once(child, "exit");
  }
}
