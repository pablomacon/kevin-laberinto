import { startLocalServer } from "./server.js";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT inválido");
const app = await startLocalServer({
  port,
  webRoot: fileURLToPath(new URL("../../web/dist/", import.meta.url)),
});
console.log("Kevin Beta 0.1: http://localhost:" + app.port + "/play");
for (const entry of Object.values(networkInterfaces()).flatMap(
  (items) => items ?? [],
))
  if (entry.family === "IPv4" && !entry.internal)
    console.log("LAN: http://" + entry.address + ":" + app.port + "/play");
console.log(
  "Director: http://localhost:" + app.port + "/admin#" + app.directorToken,
);
console.log(
  "OBS: http://localhost:" + app.port + "/broadcast#" + app.broadcastToken,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
