import Phaser from "phaser";
import {
  generateMaze,
  type GenerationError,
  type MazeConfig,
} from "@kevin/maze-engine";
import type { Position } from "@kevin/shared";
import { MazeViewerScene } from "./maze-scene.js";
import { exportMazeToPng } from "./png-exporter.js";
import {
  createViewerState,
  DEFAULT_VIEWER_CONFIG,
  generateNextSeed,
  getParticipantStyle,
  getSelectedExplorer,
  isKevinVisible,
  moveSelectedPlayer,
  resetPlayerExploration,
  selectPlayer,
  type MoveDirection,
  type ViewerState,
  type ViewMode,
} from "./viewer-logic.js";

export * from "./viewer-logic.js";

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Elemento DOM requerido no encontrado: #${id}`);
  }
  return el as T;
}

function bootstrapMazeLaboratory(): void {
  const container = getElement<HTMLDivElement>("phaser-container");
  const form = getElement<HTMLFormElement>("generation-form");
  const inputSeed = getElement<HTMLInputElement>("input-seed");
  const inputColumns = getElement<HTMLInputElement>("input-columns");
  const inputRows = getElement<HTMLInputElement>("input-rows");
  const inputEntrances = getElement<HTMLSelectElement>("input-entrances");
  const inputExtraRate = getElement<HTMLInputElement>("input-extra-rate");
  const outputExtraRate = getElement<HTMLOutputElement>("output-extra-rate");
  const inputTolerance = getElement<HTMLInputElement>("input-tolerance");
  const outputTolerance = getElement<HTMLOutputElement>("output-tolerance");
  const btnNewSeed = getElement<HTMLButtonElement>("btn-new-seed");

  const btnModeFull = getElement<HTMLButtonElement>("btn-mode-full");
  const btnModeLantern = getElement<HTMLButtonElement>("btn-mode-lantern");
  const btnZoomIn = getElement<HTMLButtonElement>("btn-zoom-in");
  const btnZoomOut = getElement<HTMLButtonElement>("btn-zoom-out");
  const btnResetView = getElement<HTMLButtonElement>("btn-reset-view");
  const btnSidebarResetView = getElement<HTMLButtonElement>(
    "btn-sidebar-reset-view",
  );
  const zoomIndicator = getElement<HTMLSpanElement>("zoom-indicator");
  const validationPill = getElement<HTMLDivElement>("validation-pill");

  const errorBanner = getElement<HTMLDivElement>("error-banner");
  const errorTitle = getElement<HTMLDivElement>("error-title");
  const errorMessage = getElement<HTMLParagraphElement>("error-message");
  const errorReasons = getElement<HTMLUListElement>("error-reasons");
  const kevinBanner = getElement<HTMLDivElement>("kevin-reached-banner");

  const statusSeed = getElement<HTMLElement>("status-seed");
  const statusPlayer = getElement<HTMLElement>("status-player");
  const statusEntrance = getElement<HTMLElement>("status-entrance");
  const statusExplorerPos = getElement<HTMLElement>("status-explorer-pos");
  const statusKevinVisibility = getElement<HTMLElement>(
    "status-kevin-visibility",
  );
  const statusHoverCell = getElement<HTMLElement>("status-hover-cell");

  const playerSelectorGrid = getElement<HTMLDivElement>("player-selector-grid");
  const selectedPlayerSummary = getElement<HTMLDivElement>(
    "selected-player-summary",
  );
  const chkSelectedPath = getElement<HTMLInputElement>("chk-selected-path");
  const chkAllPaths = getElement<HTMLInputElement>("chk-all-paths");

  const expEntranceCoord = getElement<HTMLElement>("exp-entrance-coord");
  const expCurrentCoord = getElement<HTMLElement>("exp-current-coord");
  const expStepsMemory = getElement<HTMLElement>("exp-steps-memory");
  const btnResetExploration = getElement<HTMLButtonElement>(
    "btn-reset-exploration",
  );

  const chkGrid = getElement<HTMLInputElement>("chk-grid");
  const chkEntranceLabels = getElement<HTMLInputElement>("chk-entrance-labels");
  const chkArticulation = getElement<HTMLInputElement>("chk-articulation");
  const chkExportPaths = getElement<HTMLInputElement>("chk-export-paths");
  const btnExportPng = getElement<HTMLButtonElement>("btn-export-png");

  const statsValidTag = getElement<HTMLSpanElement>("stats-valid-tag");
  const distanceBars = getElement<HTMLDivElement>("distance-bars");
  const metricsList = getElement<HTMLDListElement>("metrics-list");

  let seedCounter = 1;
  let currentState: ViewerState | null = null;

  const initialGeneration = generateMaze(DEFAULT_VIEWER_CONFIG);
  if ("code" in initialGeneration) {
    throw new Error(
      `No se pudo generar el laberinto inicial: ${initialGeneration.message}`,
    );
  }
  currentState = createViewerState(initialGeneration);

  const scene = new MazeViewerScene({
    onSelectPlayer: (playerIndex: number) => {
      if (!currentState) return;
      currentState = selectPlayer(currentState, playerIndex);
      syncAll();
    },
    onHoverCell: (pos: Position | null) => {
      statusHoverCell.textContent = pos ? `(${pos.column}, ${pos.row})` : "—";
    },
    onZoomChange: (zoom: number) => {
      zoomIndicator.textContent = `${Math.round(zoom * 100)} %`;
    },
  });

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: container,
    backgroundColor: "#070b14",
    width: Math.max(320, container.clientWidth || 960),
    height: Math.max(240, container.clientHeight || 540),
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
    },
    scene: [scene],
  });

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        game.scale.resize(Math.floor(width), Math.floor(height));
      }
    }
  });
  resizeObserver.observe(container);

  function hideGenerationError(): void {
    errorBanner.hidden = true;
    errorReasons.innerHTML = "";
  }

  function showGenerationError(error: GenerationError): void {
    errorBanner.hidden = false;
    errorTitle.textContent = `Generación rechazada [${error.code}] (${error.attempts} intento${error.attempts === 1 ? "" : "s"})`;
    errorMessage.textContent = error.message;
    errorReasons.innerHTML = "";
    for (const reason of error.reasons) {
      const li = document.createElement("li");
      li.textContent = reason;
      errorReasons.appendChild(li);
    }
    validationPill.textContent = `ERROR: ${error.code}`;
    validationPill.className = "validation-pill invalid";
  }

  function readFormConfig(): MazeConfig {
    const seed = inputSeed.value.trim();
    const columns = Number(inputColumns.value);
    const rows = Number(inputRows.value);
    const entranceCount = Number(inputEntrances.value);
    const extraConnectionRate = Number(inputExtraRate.value) / 100;
    const distanceTolerance = Number(inputTolerance.value) / 100;

    return {
      seed,
      columns,
      rows,
      entranceCount,
      extraConnectionRate,
      distanceTolerance,
    };
  }

  function executeGeneration(config: MazeConfig): void {
    const result = generateMaze(config);
    if ("code" in result) {
      showGenerationError(result);
      return;
    }

    hideGenerationError();
    currentState = createViewerState(
      result,
      currentState
        ? {
            viewMode: currentState.viewMode,
            lanternRadius: currentState.lanternRadius,
            showSelectedPath: currentState.showSelectedPath,
            showAllPaths: currentState.showAllPaths,
            showGrid: currentState.showGrid,
            showEntranceLabels: currentState.showEntranceLabels,
            showArticulationPoints: currentState.showArticulationPoints,
            includePathsInExport: currentState.includePathsInExport,
          }
        : {},
    );
    syncAll();
  }

  function setViewMode(mode: ViewMode): void {
    if (!currentState || currentState.viewMode === mode) return;
    currentState = {
      ...currentState,
      viewMode: mode,
    };
    syncAll();
  }

  function triggerMove(direction: MoveDirection): void {
    if (!currentState) return;
    const outcome = moveSelectedPlayer(currentState, direction);
    currentState = outcome.state;
    syncAll();
  }

  function renderParticipantSelector(state: ViewerState): void {
    playerSelectorGrid.innerHTML = "";
    const { maze, metrics, selectedPlayerIndex } = state;

    maze.entrances.forEach((entrance, index) => {
      const style = getParticipantStyle(index);
      const distance = metrics.distance.byEntrance[index] ?? -1;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `player-chip${index === selectedPlayerIndex ? " active" : ""}`;
      btn.style.borderColor =
        index === selectedPlayerIndex ? style.hex : "var(--border-strong)";
      btn.setAttribute("role", "radio");
      btn.setAttribute(
        "aria-checked",
        index === selectedPlayerIndex ? "true" : "false",
      );

      btn.innerHTML = `
        <div class="player-chip-top">
          <span>${style.id}</span>
          <span class="player-swatch" style="background-color: ${style.hex}"></span>
        </div>
        <div class="player-chip-meta">(${entrance.column}, ${entrance.row}) · ${distance} pasos</div>
      `;

      btn.addEventListener("click", () => {
        if (!currentState) return;
        currentState = selectPlayer(currentState, index);
        syncAll();
      });

      playerSelectorGrid.appendChild(btn);
    });

    const selectedStyle = getParticipantStyle(selectedPlayerIndex);
    const selectedEntrance = maze.entrances[selectedPlayerIndex]!;
    const selectedDistance =
      metrics.distance.byEntrance[selectedPlayerIndex] ?? -1;
    selectedPlayerSummary.innerHTML = `
      <strong style="color: ${selectedStyle.hex}">${selectedStyle.id} (${selectedStyle.name})</strong>
      — Entrada en <code>(${selectedEntrance.column}, ${selectedEntrance.row})</code>
      · Distancia mínima BFS a Kevin: <strong>${selectedDistance} casillas</strong>
    `;
  }

  function renderStatistics(state: ViewerState): void {
    const { maze, metrics, validation } = state;
    const maxDist = Math.max(1, metrics.distance.maximum);

    if (validation.valid) {
      validationPill.textContent = "MAPA VÁLIDO";
      validationPill.className = "validation-pill valid";
      statsValidTag.textContent = "Superó validación";
    } else {
      validationPill.textContent = "MAPA INVÁLIDO";
      validationPill.className = "validation-pill invalid";
      statsValidTag.textContent = "Rechazado";
    }

    distanceBars.innerHTML = "";
    metrics.distance.byEntrance.forEach((dist, idx) => {
      const style = getParticipantStyle(idx);
      const pct = Math.max(6, Math.round((dist / maxDist) * 100));
      const row = document.createElement("div");
      row.className = "distance-bar-row";
      row.innerHTML = `
        <strong style="color: ${style.hex}">${style.id}</strong>
        <div class="distance-bar-track">
          <div class="distance-bar-fill" style="width: ${pct}%; background-color: ${style.hex}"></div>
        </div>
        <span class="distance-bar-val">${dist} pasos</span>
      `;
      distanceBars.appendChild(row);
    });

    const items: readonly [string, string][] = [
      [
        "Validación del motor",
        validation.valid ? "Superada (Válido)" : "Fallida",
      ],
      ["Dimensiones", `${maze.config.columns} × ${maze.config.rows}`],
      ["Semilla utilizada", maze.config.seed],
      ["Número de entradas", String(maze.entrances.length)],
      ["Coordenadas de Kevin (K)", `(${maze.kevin.column}, ${maze.kevin.row})`],
      [
        "Distancias (mín / med / máx)",
        `${metrics.distance.minimum} / ${metrics.distance.average.toFixed(1)} / ${metrics.distance.maximum}`,
      ],
      [
        "Diferencia relativa de distancias",
        `${(metrics.distance.relativeDifference * 100).toFixed(2)} % (máx. ${(metrics.entranceDistanceTolerance * 100).toFixed(0)} %)`,
      ],
      [
        "Suelo transitable",
        `${(metrics.traversablePercentage * 100).toFixed(1)} % (${metrics.traversableCells} casillas)`,
      ],
      ["Callejones sin salida", String(metrics.deadEnds)],
      ["Bifurcaciones", String(metrics.junctions)],
      ["Ciclos independientes", String(metrics.independentCycles)],
      ["Puntos de articulación", String(metrics.articulationPoints.length)],
      [
        "Cuello de botella común",
        metrics.hasSharedBottleneck ? "Sí (crítico)" : "No",
      ],
    ];

    metricsList.innerHTML = "";
    for (const [label, value] of items) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      metricsList.append(dt, dd);
    }
  }

  function syncAll(): void {
    if (!currentState) return;
    const state = currentState;
    const explorer = getSelectedExplorer(state);
    const style = getParticipantStyle(state.selectedPlayerIndex);
    const kevinSeen = isKevinVisible(
      state.maze,
      explorer.position,
      state.viewMode,
      state.lanternRadius,
    );

    btnModeFull.classList.toggle("active", state.viewMode === "full");
    btnModeLantern.classList.toggle("active", state.viewMode === "lantern");

    chkSelectedPath.checked = state.showSelectedPath;
    chkAllPaths.checked = state.showAllPaths;
    chkGrid.checked = state.showGrid;
    chkEntranceLabels.checked = state.showEntranceLabels;
    chkArticulation.checked = state.showArticulationPoints;
    chkExportPaths.checked = state.includePathsInExport;

    statusSeed.textContent = state.maze.config.seed;
    statusPlayer.textContent = `${style.id} (${style.name})`;
    statusPlayer.style.color = style.hex;
    statusEntrance.textContent = `(${explorer.entrance.column}, ${explorer.entrance.row})`;
    statusExplorerPos.textContent = `(${explorer.position.column}, ${explorer.position.row})`;
    statusKevinVisibility.textContent = kevinSeen
      ? `Visible (${state.maze.kevin.column}, ${state.maze.kevin.row})`
      : "Oculto (fuera de linterna)";

    expEntranceCoord.textContent = `(${explorer.entrance.column}, ${explorer.entrance.row})`;
    expCurrentCoord.textContent = `(${explorer.position.column}, ${explorer.position.row})`;
    expStepsMemory.textContent = `${explorer.steps} paso${explorer.steps === 1 ? "" : "s"} · ${explorer.exploredKeys.size} casillas`;

    kevinBanner.hidden = !explorer.reachedKevin;

    renderParticipantSelector(state);
    renderStatistics(state);
    scene.setViewerState(state);
  }

  // Sliders: solo actualizan la etiqueta visual; no regeneran hasta pulsar "Generar laberinto"
  inputExtraRate.addEventListener("input", () => {
    outputExtraRate.value = `${inputExtraRate.value} %`;
  });
  inputTolerance.addEventListener("input", () => {
    outputTolerance.value = `${inputTolerance.value} %`;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    executeGeneration(readFormConfig());
  });

  btnNewSeed.addEventListener("click", () => {
    const nextSeed = generateNextSeed(inputSeed.value, seedCounter);
    seedCounter += 1;
    inputSeed.value = nextSeed;
    executeGeneration(readFormConfig());
  });

  btnModeFull.addEventListener("click", () => setViewMode("full"));
  btnModeLantern.addEventListener("click", () => setViewMode("lantern"));

  btnZoomIn.addEventListener("click", () => scene.adjustZoom(1.25));
  btnZoomOut.addEventListener("click", () => scene.adjustZoom(0.8));
  btnResetView.addEventListener("click", () => scene.resetCamera());
  btnSidebarResetView.addEventListener("click", () => scene.resetCamera());

  chkSelectedPath.addEventListener("change", () => {
    if (!currentState) return;
    currentState = {
      ...currentState,
      showSelectedPath: chkSelectedPath.checked,
    };
    syncAll();
  });

  chkAllPaths.addEventListener("change", () => {
    if (!currentState) return;
    currentState = {
      ...currentState,
      showAllPaths: chkAllPaths.checked,
    };
    syncAll();
  });

  chkGrid.addEventListener("change", () => {
    if (!currentState) return;
    currentState = {
      ...currentState,
      showGrid: chkGrid.checked,
    };
    syncAll();
  });

  chkEntranceLabels.addEventListener("change", () => {
    if (!currentState) return;
    currentState = {
      ...currentState,
      showEntranceLabels: chkEntranceLabels.checked,
    };
    syncAll();
  });

  chkArticulation.addEventListener("change", () => {
    if (!currentState) return;
    currentState = {
      ...currentState,
      showArticulationPoints: chkArticulation.checked,
    };
    syncAll();
  });

  chkExportPaths.addEventListener("change", () => {
    if (!currentState) return;
    currentState = {
      ...currentState,
      includePathsInExport: chkExportPaths.checked,
    };
    syncAll();
  });

  btnResetExploration.addEventListener("click", () => {
    if (!currentState) return;
    currentState = resetPlayerExploration(currentState);
    syncAll();
  });

  btnExportPng.addEventListener("click", () => {
    if (!currentState) return;
    exportMazeToPng(currentState);
  });

  document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = btn.dataset.move as MoveDirection | undefined;
      if (!dir || !currentState) return;
      if (currentState.viewMode !== "lantern") {
        currentState = { ...currentState, viewMode: "lantern" };
      }
      triggerMove(dir);
    });
  });

  window.addEventListener("keydown", (event: KeyboardEvent) => {
    if (!currentState || currentState.viewMode !== "lantern") {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }

    const keyMap: Readonly<Record<string, MoveDirection>> = {
      ArrowUp: "up",
      KeyW: "up",
      w: "up",
      W: "up",
      ArrowDown: "down",
      KeyS: "down",
      s: "down",
      S: "down",
      ArrowLeft: "left",
      KeyA: "left",
      a: "left",
      A: "left",
      ArrowRight: "right",
      KeyD: "right",
      d: "right",
      D: "right",
    };

    const direction = keyMap[event.code] ?? keyMap[event.key];
    if (!direction) return;

    event.preventDefault();
    triggerMove(direction);
  });

  syncAll();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapMazeLaboratory);
  } else {
    bootstrapMazeLaboratory();
  }
}
