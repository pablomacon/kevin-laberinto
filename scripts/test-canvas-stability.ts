import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { startLocalServer } from "../apps/server-local/src/server.js";
import type { ServerMessage } from "../packages/protocol/src/index.js";

interface CanvasMetrics {
  timestampMs: number;
  canvasWidth: number;
  canvasHeight: number;
  containerClientWidth: number;
  containerClientHeight: number;
  rectTop: number;
  rectLeft: number;
  rectWidth: number;
  rectHeight: number;
}

class CdpClient {
  private ws: WebSocket;
  private idCounter = 0;
  private callbacks = new Map<number, (res: unknown) => void>();

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
  }

  async ready(): Promise<void> {
    if (this.ws.readyState !== WebSocket.OPEN) {
      await once(this.ws, "open");
    }
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (typeof msg.id === "number" && this.callbacks.has(msg.id)) {
        const cb = this.callbacks.get(msg.id)!;
        this.callbacks.delete(msg.id);
        cb(msg);
      }
    });
  }

  async send<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const id = ++this.idCounter;
    const payload = JSON.stringify({ id, method, params });
    const promise = new Promise<T>((resolve, reject) => {
      this.callbacks.set(id, (msg: unknown) => {
        const m = msg as { error?: { message: string }; result?: T };
        if (m.error) {
          reject(new Error(`CDP Error [${method}]: ${m.error.message}`));
        } else {
          resolve(m.result as T);
        }
      });
    });
    this.ws.send(payload);
    return promise;
  }

  async eval<T = unknown>(expression: string): Promise<T> {
    const res = await this.send<{ result: { value: T } }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result.value;
  }

  close(): void {
    try {
      this.ws.terminate();
    } catch {
      // Ignorar error de cierre
    }
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function until(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 15000,
  desc = "condición",
): Promise<void> {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout esperando: ${desc}`);
    }
    await sleep(50);
  }
}

async function createWsPlayer(port: number, name: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const messages: ServerMessage[] = [];
  ws.on("message", (data) =>
    messages.push(JSON.parse(data.toString()) as ServerMessage),
  );
  await once(ws, "open");
  let msgId = 0;
  const send = (type: string, fields: Record<string, unknown> = {}) => {
    ws.send(
      JSON.stringify({
        protocolVersion: 1,
        messageId: `test-${++msgId}`,
        type,
        ...fields,
      }),
    );
  };
  send("room.access", { role: "player" });
  await until(
    () => messages.some((m) => m.type === "room.accessed"),
    5000,
    `room.accessed para ${name}`,
  );
  send("player.join", { displayName: name });
  await until(
    () => messages.some((m) => m.type === "player.joined"),
    5000,
    `player.joined para ${name}`,
  );
  return { ws, messages, send };
}

async function main() {
  console.log(
    "=== KEL-005-B: Prueba de regresión de estabilidad de canvas en navegador real ===",
  );

  const edgePath =
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const server = await startLocalServer({ host: "127.0.0.1", port: 0 });
  const port = server.port;
  console.log(`[1/5] Servidor local iniciado en http://127.0.0.1:${port}`);

  const profileDir = await mkdtemp(join(tmpdir(), "edge-canvas-"));
  const cdpPort = 9250 + Math.floor(Math.random() * 400);

  console.log(
    `[2/5] Lanzando Microsoft Edge headless (CDP port ${cdpPort})...`,
  );
  const edgeProc: ChildProcess = spawn(edgePath, [
    "--headless=new",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-background-networking",
    "--window-size=1366,768",
  ]);

  edgeProc.on("error", (err) => console.error("Error en proceso Edge:", err));

  let cdpClient: CdpClient | null = null;
  const wsClients: { ws: WebSocket }[] = [];

  try {
    // Esperar a que CDP esté disponible
    await until(
      async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
          return res.ok;
        } catch {
          return false;
        }
      },
      15000,
      "CDP endpoint de Edge",
    );

    // Abrir pestaña para /play
    const tabRes = await fetch(
      `http://127.0.0.1:${cdpPort}/json/new?http://127.0.0.1:${port}/play`,
      { method: "PUT" },
    );
    const tabData = (await tabRes.json()) as { webSocketDebuggerUrl: string };
    assert(tabData.webSocketDebuggerUrl, "Debugger URL de pestaña obtenida");

    cdpClient = new CdpClient(tabData.webSocketDebuggerUrl);
    await cdpClient.ready();
    await cdpClient.send("Page.enable");
    await cdpClient.send("Runtime.enable");

    // Fijar viewport inicial estándar Ceibal (1366x768)
    await cdpClient.send("Emulation.setDeviceMetricsOverride", {
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log("[3/5] Pestaña /play cargada en Edge. Uniendo participante...");
    await sleep(800);

    // Ingresar alias y unirse desde Edge
    const joinedInEdge = await cdpClient.eval<boolean>(`
      (() => {
        const input = document.getElementById("player-alias-input");
        const btn = document.getElementById("player-join-btn");
        if (input && btn) {
          input.value = "Estudiante Ceibal";
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    assert(joinedInEdge, "Participante Edge unido correctamente");

    // Conectar otros 2 participantes simulados para cumplir el mínimo de 3
    console.log("Conectando participantes simulados P2 y P3...");
    const p2 = await createWsPlayer(port, "Compañero 2");
    const p3 = await createWsPlayer(port, "Compañero 3");
    wsClients.push(p2, p3);

    // Conectar Director y dar inicio a la carrera
    console.log("Conectando director y comenzando la carrera...");
    const dirWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    wsClients.push({ ws: dirWs });
    await once(dirWs, "open");
    dirWs.send(
      JSON.stringify({
        protocolVersion: 1,
        messageId: "dir-init",
        type: "room.access",
        role: "director",
        token: server.directorToken,
      }),
    );
    await sleep(400);
    dirWs.send(
      JSON.stringify({
        protocolVersion: 1,
        messageId: "dir-start",
        type: "admin.start",
      }),
    );

    // Esperar a que la carrera esté en fase 'running' y el canvas de juego sea visible
    await until(
      async () => {
        const isRunning = await cdpClient!.eval<boolean>(`
        (() => {
          const gameView = document.getElementById("player-game-view");
          const canvas = document.getElementById("player-canvas");
          return Boolean(gameView && !gameView.hidden && canvas && canvas.width > 0 && canvas.height > 0);
        })()
      `);
        return isRunning;
      },
      15000,
      "fase running y canvas visible en Edge",
    );

    console.log(
      "Carrera en curso. Iniciando monitoreo de 30 segundos con ventana constante...",
    );

    const getCanvasMetrics = async (
      canvasId = "player-canvas",
    ): Promise<CanvasMetrics> => {
      return await cdpClient!.eval<CanvasMetrics>(`
        (() => {
          const canvas = document.getElementById("${canvasId}");
          if (!canvas) throw new Error("Canvas no encontrado: ${canvasId}");
          const container = canvas.parentElement;
          const rect = canvas.getBoundingClientRect();
          return {
            timestampMs: Date.now(),
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            containerClientWidth: container ? container.clientWidth : 0,
            containerClientHeight: container ? container.clientHeight : 0,
            rectTop: Math.round(rect.top * 100) / 100,
            rectLeft: Math.round(rect.left * 100) / 100,
            rectWidth: Math.round(rect.width * 100) / 100,
            rectHeight: Math.round(rect.height * 100) / 100
          };
        })()
      `);
    };

    // =========================================================================
    // ENSAYO 1: 30 segundos continuos con ticks WebSocket sin interacción
    // =========================================================================
    const initialMetrics = await getCanvasMetrics("player-canvas");
    console.log("Métricas iniciales:", initialMetrics);
    assert(initialMetrics.canvasWidth > 0 && initialMetrics.canvasHeight > 0);

    const samples: CanvasMetrics[] = [initialMetrics];
    const durationSeconds = 30;
    const intervalSeconds = 3;
    const totalSteps = durationSeconds / intervalSeconds;

    for (let s = 1; s <= totalSteps; s++) {
      await sleep(intervalSeconds * 1000);
      const m = await getCanvasMetrics("player-canvas");
      samples.push(m);
      console.log(
        `[t = ${s * intervalSeconds}s] canvas: ${m.canvasWidth}x${m.canvasHeight} | rect: (${m.rectLeft}, ${m.rectTop}) ${m.rectWidth}x${m.rectHeight} | container: ${m.containerClientWidth}x${m.containerClientHeight}`,
      );

      // Comprobar estrictamente que las dimensiones y posición no crecen ni se desplazan
      assert.equal(
        m.canvasWidth,
        initialMetrics.canvasWidth,
        `canvasWidth cambió en paso ${s}`,
      );
      assert.equal(
        m.canvasHeight,
        initialMetrics.canvasHeight,
        `canvasHeight cambió en paso ${s}`,
      );
      assert.equal(
        m.containerClientWidth,
        initialMetrics.containerClientWidth,
        `containerClientWidth cambió en paso ${s}`,
      );
      assert.equal(
        m.containerClientHeight,
        initialMetrics.containerClientHeight,
        `containerClientHeight cambió en paso ${s}`,
      );
      assert.equal(
        m.rectTop,
        initialMetrics.rectTop,
        `rectTop se desplazó en paso ${s}`,
      );
      assert.equal(
        m.rectLeft,
        initialMetrics.rectLeft,
        `rectLeft se desplazó en paso ${s}`,
      );
      assert.equal(
        m.rectWidth,
        initialMetrics.rectWidth,
        `rectWidth cambió en paso ${s}`,
      );
      assert.equal(
        m.rectHeight,
        initialMetrics.rectHeight,
        `rectHeight cambió en paso ${s}`,
      );
    }
    console.log(
      "✔ Ensayo 1 superado: Cero variación de dimensiones y posición durante 30 segundos continuos de ticks.",
    );

    // =========================================================================
    // ENSAYO 2: Estabilidad tras múltiples movimientos del jugador
    // =========================================================================
    console.log(
      "[4/5] Ensayo 2: Comprobando estabilidad durante movimientos de los participantes...",
    );
    for (let step = 0; step < 8; step++) {
      // Simular tecla o click en d-pad
      await cdpClient.eval(`
        (() => {
          const btn = document.querySelector('[data-dir="right"]') || document.querySelector('[data-dir="down"]');
          if (btn) btn.click();
        })()
      `);
      await sleep(500);

      const postMoveMetrics = await getCanvasMetrics("player-canvas");
      assert.equal(
        postMoveMetrics.canvasWidth,
        initialMetrics.canvasWidth,
        `canvasWidth varió tras movimiento ${step}`,
      );
      assert.equal(
        postMoveMetrics.canvasHeight,
        initialMetrics.canvasHeight,
        `canvasHeight varió tras movimiento ${step}`,
      );
      assert.equal(
        postMoveMetrics.rectTop,
        initialMetrics.rectTop,
        `rectTop varió tras movimiento ${step}`,
      );
      assert.equal(
        postMoveMetrics.rectHeight,
        initialMetrics.rectHeight,
        `rectHeight varió tras movimiento ${step}`,
      );
    }
    console.log(
      "✔ Ensayo 2 superado: Dimensiones y encuadre 100% estables tras movimientos sucesivos.",
    );

    // =========================================================================
    // ENSAYO 3: Vista OBS 1920 × 1080
    // =========================================================================
    console.log(
      "[5/5] Ensayo 3: Navegando a vista OBS (/broadcast) en resolución 1920 × 1080...",
    );
    await cdpClient.send("Page.navigate", {
      url: `http://127.0.0.1:${port}/broadcast#${server.broadcastToken}`,
    });
    await sleep(1000);

    await cdpClient.send("Emulation.setDeviceMetricsOverride", {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(800);

    const obsInitial = await getCanvasMetrics("obs-canvas");
    console.log("Métricas iniciales OBS (1920x1080):", obsInitial);
    assert(
      obsInitial.canvasWidth > 1800,
      "Canvas OBS cubre el ancho disponible",
    );
    assert(
      obsInitial.canvasHeight > 900,
      "Canvas OBS cubre el alto disponible",
    );

    for (let s = 1; s <= 4; s++) {
      await sleep(2500);
      const m = await getCanvasMetrics("obs-canvas");
      console.log(
        `[OBS t = ${s * 2.5}s] canvas: ${m.canvasWidth}x${m.canvasHeight} | rect: (${m.rectLeft}, ${m.rectTop})`,
      );
      assert.equal(
        m.canvasWidth,
        obsInitial.canvasWidth,
        `OBS canvasWidth varió en paso ${s}`,
      );
      assert.equal(
        m.canvasHeight,
        obsInitial.canvasHeight,
        `OBS canvasHeight varió en paso ${s}`,
      );
      assert.equal(
        m.rectTop,
        obsInitial.rectTop,
        `OBS rectTop varió en paso ${s}`,
      );
      assert.equal(
        m.rectHeight,
        obsInitial.rectHeight,
        `OBS rectHeight varió en paso ${s}`,
      );
    }
    console.log(
      "✔ Ensayo 3 superado: Vista OBS perfectamente estable en 1920 × 1080.",
    );

    // =========================================================================
    // ENSAYO 4: Redimensionamiento de ventana (adaptación limpia sin deriva)
    // =========================================================================
    console.log("Ensayo 4: Redimensionando ventana a 1280 × 720...");
    await cdpClient.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(800);

    const resizedInitial = await getCanvasMetrics("obs-canvas");
    console.log("Métricas post-redimensionamiento (1280x720):", resizedInitial);
    assert(
      resizedInitial.canvasWidth < obsInitial.canvasWidth,
      "Canvas se adaptó reduciendo su ancho",
    );
    assert(
      resizedInitial.canvasHeight < obsInitial.canvasHeight,
      "Canvas se adaptó reduciendo su alto",
    );

    // Verificar que tras adaptarse, permanece 100% estable sin deriva acumulativa
    for (let s = 1; s <= 4; s++) {
      await sleep(2000);
      const m = await getCanvasMetrics("obs-canvas");
      assert.equal(
        m.canvasWidth,
        resizedInitial.canvasWidth,
        `Canvas varió tras redimensionar en paso ${s}`,
      );
      assert.equal(
        m.canvasHeight,
        resizedInitial.canvasHeight,
        `Canvas varió tras redimensionar en paso ${s}`,
      );
      assert.equal(
        m.rectTop,
        resizedInitial.rectTop,
        `rectTop varió tras redimensionar en paso ${s}`,
      );
    }
    console.log(
      "✔ Ensayo 4 superado: Canvas se adapta limpiamente al nuevo tamaño y permanece estable.",
    );

    console.log(
      "\n================================================================================",
    );
    console.log(
      "  TODAS LAS PRUEBAS DE REGRESIÓN EN NAVEGADOR REAL COMPLETADAS CON ÉXITO",
    );
    console.log(
      "================================================================================\n",
    );
  } finally {
    if (cdpClient) cdpClient.close();
    for (const c of wsClients) {
      try {
        c.ws.terminate();
      } catch {
        // Ignorar error al terminar socket
      }
    }
    edgeProc.kill("SIGKILL");
    await server.close();
    try {
      await rm(profileDir, { recursive: true, force: true });
    } catch {
      // Ignorar error al borrar directorio temporal
    }
  }
}

main().catch((err) => {
  console.error("FALLO EN PRUEBA DE REGRESIÓN:", err);
  process.exit(1);
});
