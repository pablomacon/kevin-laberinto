import Phaser from "phaser";
import type { CellMatrix } from "@kevin/maze-engine";
import type { Position } from "@kevin/shared";
import {
  buildTerrainCacheKey,
  calculateViewportLayout,
  computeAllOptimalPaths,
  computeOptimalPath,
  getCellVisibility,
  getParticipantStyle,
  getSelectedExplorer,
  gridToScreen,
  hasMazeChanged,
  isKevinVisible,
  samePosition,
  screenToGrid,
  shouldRedrawTerrain,
  type ViewportLayout,
  type ViewerState,
} from "./viewer-logic.js";

export interface MazeSceneCallbacks {
  readonly onSelectPlayer: (playerIndex: number) => void;
  readonly onHoverCell: (position: Position | null) => void;
  readonly onZoomChange: (zoom: number) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

export class MazeViewerScene extends Phaser.Scene {
  private readonly callbacks: MazeSceneCallbacks;
  private viewerState: ViewerState | null = null;
  private layout: ViewportLayout | null = null;

  // Capas separadas (Sección 14):
  // 1. Terreno (estático por mapa/tamaño/cuadrícula)
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  // 2. Herramientas de depuración (puntos de articulación)
  private debugGraphics!: Phaser.GameObjects.Graphics;
  // 3. Rutas óptimas
  private pathsGraphics!: Phaser.GameObjects.Graphics;
  // 4. Entradas y objetivo (Kevin)
  private entitiesGraphics!: Phaser.GameObjects.Graphics;
  // 5. Posición del explorador de prueba
  private explorerGraphics!: Phaser.GameObjects.Graphics;
  // 6. Iluminación y memoria (modo linterna)
  private lightingGraphics!: Phaser.GameObjects.Graphics;
  // 7. Etiquetas de texto (J1..J6 y K)
  private labelsContainer!: Phaser.GameObjects.Container;

  private lastTerrainKey = "";
  private lastRenderedCells: CellMatrix | null = null;
  private isDragging = false;
  private dragMoved = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private cameraStartX = 0;
  private cameraStartY = 0;

  private wheelListener: ((event: WheelEvent) => void) | null = null;

  public constructor(callbacks: MazeSceneCallbacks) {
    super({ key: "MazeViewerScene" });
    this.callbacks = callbacks;
  }

  public create(): void {
    this.cameras.main.setBackgroundColor("#070b14");

    this.terrainGraphics = this.add.graphics().setDepth(10);
    this.debugGraphics = this.add.graphics().setDepth(20);
    this.pathsGraphics = this.add.graphics().setDepth(30);
    this.lightingGraphics = this.add.graphics().setDepth(40);
    this.entitiesGraphics = this.add.graphics().setDepth(50);
    this.explorerGraphics = this.add.graphics().setDepth(60);
    this.labelsContainer = this.add.container(0, 0).setDepth(70);

    this.setupInteractions();
    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);

    if (this.viewerState) {
      this.recalculateLayout();
      this.renderAll(true);
    }
  }

  public setViewerState(nextState: ViewerState): void {
    const previousState = this.viewerState;
    const previousCols = previousState?.maze.config.columns;
    const previousRows = previousState?.maze.config.rows;
    const mazeChanged = hasMazeChanged(previousState, nextState);

    this.viewerState = nextState;

    if (!this.scene.isActive()) {
      return;
    }

    const dimensionsChanged =
      previousCols !== nextState.maze.config.columns ||
      previousRows !== nextState.maze.config.rows ||
      this.layout === null;

    if (dimensionsChanged) {
      this.recalculateLayout();
      this.resetCamera();
    }

    const forceTerrain =
      dimensionsChanged ||
      mazeChanged ||
      (this.layout !== null &&
        shouldRedrawTerrain(
          previousState,
          nextState,
          this.lastTerrainKey,
          this.layout,
        ));

    this.renderAll(forceTerrain);
  }

  public resetCamera(): void {
    if (!this.cameras?.main) return;
    const cam = this.cameras.main;
    cam.setZoom(1);
    cam.centerOn(this.scale.width / 2, this.scale.height / 2);
    this.callbacks.onZoomChange(1);
  }

  public adjustZoom(factor: number): void {
    if (!this.cameras?.main) return;
    const cam = this.cameras.main;
    const nextZoom = Phaser.Math.Clamp(
      Number((cam.zoom * factor).toFixed(2)),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    cam.setZoom(nextZoom);
    if (nextZoom === 1) {
      cam.centerOn(this.scale.width / 2, this.scale.height / 2);
    }
    this.callbacks.onZoomChange(nextZoom);
  }

  private handleResize(): void {
    this.lastTerrainKey = "";
    this.lastRenderedCells = null;
    this.recalculateLayout();
    if (this.cameras?.main && this.cameras.main.zoom === 1) {
      this.cameras.main.centerOn(this.scale.width / 2, this.scale.height / 2);
    }
    this.renderAll(true);
  }

  private recalculateLayout(): void {
    if (!this.viewerState) return;
    const { columns, rows } = this.viewerState.maze.config;
    this.layout = calculateViewportLayout(
      this.scale.width,
      this.scale.height,
      columns,
      rows,
      14,
    );
  }

  private setupInteractions(): void {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.isDragging = true;
      this.dragMoved = false;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.cameraStartX = this.cameras.main.scrollX;
      this.cameraStartY = this.cameras.main.scrollY;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isDragging && pointer.isDown) {
        const dx = pointer.x - this.dragStartX;
        const dy = pointer.y - this.dragStartY;
        if (Math.hypot(dx, dy) > 4) {
          this.dragMoved = true;
        }
        if (this.dragMoved && this.cameras.main.zoom > 1) {
          this.cameras.main.scrollX =
            this.cameraStartX - dx / this.cameras.main.zoom;
          this.cameras.main.scrollY =
            this.cameraStartY - dy / this.cameras.main.zoom;
        }
      }

      if (this.viewerState && this.layout) {
        const worldPoint = this.cameras.main.getWorldPoint(
          pointer.x,
          pointer.y,
        );
        const gridPos = screenToGrid(
          worldPoint.x,
          worldPoint.y,
          this.layout.cellSize,
          this.viewerState.maze.config.columns,
          this.viewerState.maze.config.rows,
          { x: this.layout.offsetX, y: this.layout.offsetY },
        );
        this.callbacks.onHoverCell(gridPos);
      }
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const wasClick = this.isDragging && !this.dragMoved;
      this.isDragging = false;
      if (!wasClick || !this.viewerState || !this.layout) {
        return;
      }

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const clickedCell = screenToGrid(
        worldPoint.x,
        worldPoint.y,
        this.layout.cellSize,
        this.viewerState.maze.config.columns,
        this.viewerState.maze.config.rows,
        { x: this.layout.offsetX, y: this.layout.offsetY },
      );
      if (!clickedCell) return;

      const entranceIndex = this.viewerState.maze.entrances.findIndex((entry) =>
        samePosition(entry, clickedCell),
      );
      if (entranceIndex >= 0) {
        this.callbacks.onSelectPlayer(entranceIndex);
      }
    });

    const canvas = this.game.canvas;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      if (!this.cameras?.main) return;
      const cam = this.cameras.main;
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;

      const beforeWorld = cam.getWorldPoint(pointerX, pointerY);
      const zoomFactor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nextZoom = Phaser.Math.Clamp(
        Number((cam.zoom * zoomFactor).toFixed(2)),
        MIN_ZOOM,
        MAX_ZOOM,
      );

      cam.setZoom(nextZoom);
      if (nextZoom === 1) {
        cam.centerOn(this.scale.width / 2, this.scale.height / 2);
      } else {
        const afterWorld = cam.getWorldPoint(pointerX, pointerY);
        cam.scrollX += beforeWorld.x - afterWorld.x;
        cam.scrollY += beforeWorld.y - afterWorld.y;
      }
      this.callbacks.onZoomChange(nextZoom);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    this.wheelListener = onWheel;
  }

  private cleanup(): void {
    this.scale.off("resize", this.handleResize, this);
    if (this.wheelListener && this.game?.canvas) {
      this.game.canvas.removeEventListener("wheel", this.wheelListener);
      this.wheelListener = null;
    }
    this.labelsContainer?.removeAll(true);
  }

  private renderAll(forceTerrain: boolean): void {
    if (!this.viewerState || !this.layout) return;

    const terrainKey = buildTerrainCacheKey(this.viewerState, this.layout);
    if (
      forceTerrain ||
      terrainKey !== this.lastTerrainKey ||
      this.lastRenderedCells !== this.viewerState.maze.cells
    ) {
      this.renderTerrainLayer();
      this.lastTerrainKey = terrainKey;
      this.lastRenderedCells = this.viewerState.maze.cells;
    }

    this.renderDebugLayer();
    this.renderPathsLayer();
    this.renderLightingLayer();
    this.renderEntitiesAndExplorerLayers();
  }

  private renderTerrainLayer(): void {
    this.terrainGraphics.clear();
    if (!this.viewerState || !this.layout) return;

    const { maze, showGrid } = this.viewerState;
    const { columns, rows } = maze.config;
    const { cellSize, offsetX, offsetY, mapWidth, mapHeight } = this.layout;
    const origin = { x: offsetX, y: offsetY };

    // Sombra/marco base del mapa
    this.terrainGraphics.fillStyle(0x0b1120, 1);
    this.terrainGraphics.fillRect(offsetX, offsetY, mapWidth, mapHeight);

    for (let row = 0; row < rows; row += 1) {
      const rowCells = maze.cells[row];
      if (!rowCells) continue;
      for (let column = 0; column < columns; column += 1) {
        const cell = rowCells[column];
        const rect = gridToScreen({ column, row }, cellSize, origin);
        if (cell === "floor") {
          this.terrainGraphics.fillStyle(0x2d405e, 1);
          this.terrainGraphics.fillRect(
            rect.x,
            rect.y,
            rect.width,
            rect.height,
          );
        } else {
          this.terrainGraphics.fillStyle(0x090e1a, 1);
          this.terrainGraphics.fillRect(
            rect.x,
            rect.y,
            rect.width,
            rect.height,
          );
        }
      }
    }

    if (showGrid) {
      this.terrainGraphics.lineStyle(1, 0x64748b, 0.25);
      for (let col = 0; col <= columns; col += 1) {
        const x = offsetX + col * cellSize;
        this.terrainGraphics.lineBetween(x, offsetY, x, offsetY + mapHeight);
      }
      for (let row = 0; row <= rows; row += 1) {
        const y = offsetY + row * cellSize;
        this.terrainGraphics.lineBetween(offsetX, y, offsetX + mapWidth, y);
      }
    }

    this.terrainGraphics.lineStyle(2, 0x334155, 0.9);
    this.terrainGraphics.strokeRect(offsetX, offsetY, mapWidth, mapHeight);
  }

  private renderDebugLayer(): void {
    this.debugGraphics.clear();
    if (
      !this.viewerState ||
      !this.layout ||
      !this.viewerState.showArticulationPoints
    ) {
      return;
    }

    const { metrics, viewMode, lanternRadius } = this.viewerState;
    const explorer = getSelectedExplorer(this.viewerState);
    const { cellSize, offsetX, offsetY } = this.layout;
    const origin = { x: offsetX, y: offsetY };

    for (const point of metrics.articulationPoints) {
      const visibility = getCellVisibility(
        point,
        explorer.position,
        explorer.exploredKeys,
        viewMode,
        lanternRadius,
      );
      if (visibility === "hidden") continue;

      const rect = gridToScreen(point, cellSize, origin);
      const radius = Math.max(2, cellSize * 0.24);
      this.debugGraphics.fillStyle(
        0xf97316,
        visibility === "visible" ? 0.85 : 0.4,
      );
      this.debugGraphics.fillCircle(rect.centerX, rect.centerY, radius);
      this.debugGraphics.lineStyle(1, 0xffedd5, 0.75);
      this.debugGraphics.strokeCircle(rect.centerX, rect.centerY, radius);
    }
  }

  private renderPathsLayer(): void {
    this.pathsGraphics.clear();
    if (!this.viewerState || !this.layout) return;

    const { maze, selectedPlayerIndex, showSelectedPath, showAllPaths } =
      this.viewerState;
    if (!showSelectedPath && !showAllPaths) return;

    const { cellSize, offsetX, offsetY } = this.layout;
    const origin = { x: offsetX, y: offsetY };

    const drawPath = (
      path: readonly Position[],
      color: number,
      alpha: number,
      widthFactor: number,
      offsetIndex = 0,
    ): void => {
      if (path.length < 2) return;
      const lineWidth = Math.max(2, cellSize * widthFactor);
      const shift =
        offsetIndex === 0 ? 0 : ((offsetIndex % 3) - 1) * (cellSize * 0.08);
      this.pathsGraphics.lineStyle(lineWidth, color, alpha);
      this.pathsGraphics.beginPath();
      for (let i = 0; i < path.length; i += 1) {
        const rect = gridToScreen(path[i]!, cellSize, origin);
        const px = rect.centerX + shift;
        const py = rect.centerY + shift;
        if (i === 0) {
          this.pathsGraphics.moveTo(px, py);
        } else {
          this.pathsGraphics.lineTo(px, py);
        }
      }
      this.pathsGraphics.strokePath();
    };

    if (showAllPaths) {
      const allPaths = computeAllOptimalPaths(maze);
      allPaths.forEach((path, idx) => {
        if (!path) return;
        const style = getParticipantStyle(idx);
        drawPath(path, style.color, 0.52, 0.26, idx + 1);
      });
    }

    if (showSelectedPath) {
      const selectedPath = computeOptimalPath(maze, selectedPlayerIndex);
      if (selectedPath) {
        const style = getParticipantStyle(selectedPlayerIndex);
        drawPath(selectedPath, 0xffffff, 0.35, 0.44, 0);
        drawPath(selectedPath, style.color, 0.94, 0.32, 0);
      }
    }
  }

  private renderLightingLayer(): void {
    this.lightingGraphics.clear();
    if (!this.viewerState || !this.layout) return;

    const { maze, viewMode, lanternRadius } = this.viewerState;
    if (viewMode !== "lantern") return;

    const explorer = getSelectedExplorer(this.viewerState);
    const { columns, rows } = maze.config;
    const { cellSize, offsetX, offsetY } = this.layout;
    const origin = { x: offsetX, y: offsetY };

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const pos: Position = { column, row };
        const state = getCellVisibility(
          pos,
          explorer.position,
          explorer.exploredKeys,
          viewMode,
          lanternRadius,
        );
        const rect = gridToScreen(pos, cellSize, origin);

        if (state === "hidden") {
          this.lightingGraphics.fillStyle(0x030712, 0.98);
          this.lightingGraphics.fillRect(
            rect.x,
            rect.y,
            rect.width + 0.5,
            rect.height + 0.5,
          );
        } else if (state === "explored") {
          this.lightingGraphics.fillStyle(0x030712, 0.64);
          this.lightingGraphics.fillRect(
            rect.x,
            rect.y,
            rect.width + 0.5,
            rect.height + 0.5,
          );
        } else {
          // Casilla actualmente iluminada dentro del círculo de la linterna
          this.lightingGraphics.fillStyle(0xfef08a, 0.08);
          this.lightingGraphics.fillRect(
            rect.x,
            rect.y,
            rect.width,
            rect.height,
          );
        }
      }
    }

    // Círculo visual de referencia de la linterna (radio euclidiano = 4 casillas)
    const explorerRect = gridToScreen(explorer.position, cellSize, origin);
    this.lightingGraphics.lineStyle(1.5, 0xfacc15, 0.65);
    this.lightingGraphics.strokeCircle(
      explorerRect.centerX,
      explorerRect.centerY,
      lanternRadius * cellSize,
    );
  }

  private renderEntitiesAndExplorerLayers(): void {
    this.entitiesGraphics.clear();
    this.explorerGraphics.clear();
    this.labelsContainer.removeAll(true);

    if (!this.viewerState || !this.layout) return;

    const {
      maze,
      selectedPlayerIndex,
      viewMode,
      lanternRadius,
      showEntranceLabels,
    } = this.viewerState;
    const explorer = getSelectedExplorer(this.viewerState);
    const { cellSize, offsetX, offsetY } = this.layout;
    const origin = { x: offsetX, y: offsetY };
    const fontSize = Math.max(9, Math.floor(cellSize * 0.56));

    // 1. Entradas (En modo linterna no se revelan los demás jugadores)
    maze.entrances.forEach((entrance, idx) => {
      if (viewMode === "lantern" && idx !== selectedPlayerIndex) {
        return;
      }

      const style = getParticipantStyle(idx);
      const rect = gridToScreen(entrance, cellSize, origin);
      const isSelected = idx === selectedPlayerIndex;

      this.entitiesGraphics.fillStyle(style.color, 1);
      this.entitiesGraphics.fillRoundedRect(
        rect.x + 1,
        rect.y + 1,
        Math.max(2, rect.width - 2),
        Math.max(2, rect.height - 2),
        Math.max(2, cellSize * 0.2),
      );

      if (isSelected) {
        this.entitiesGraphics.lineStyle(2, 0xffffff, 1);
        this.entitiesGraphics.strokeRoundedRect(
          rect.x - 1,
          rect.y - 1,
          rect.width + 2,
          rect.height + 2,
          Math.max(2, cellSize * 0.25),
        );
      }

      if (showEntranceLabels) {
        const label = this.add.text(rect.centerX, rect.centerY, style.id, {
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: `${fontSize}px`,
          fontStyle: "bold",
          color: "#060911",
        });
        label.setOrigin(0.5, 0.5);
        this.labelsContainer.add(label);
      }
    });

    // 2. Kevin (K): solo visible en modo completo o cuando está actualmente dentro del círculo de la linterna
    if (isKevinVisible(maze, explorer.position, viewMode, lanternRadius)) {
      const kevinRect = gridToScreen(maze.kevin, cellSize, origin);
      const radius = Math.max(4, cellSize * 0.46);

      this.entitiesGraphics.fillStyle(0xfacc15, 0.28);
      this.entitiesGraphics.fillCircle(
        kevinRect.centerX,
        kevinRect.centerY,
        radius * 1.45,
      );

      this.entitiesGraphics.fillStyle(0xfacc15, 1);
      this.entitiesGraphics.fillCircle(
        kevinRect.centerX,
        kevinRect.centerY,
        radius,
      );

      this.entitiesGraphics.lineStyle(2, 0xfef08a, 1);
      this.entitiesGraphics.strokeCircle(
        kevinRect.centerX,
        kevinRect.centerY,
        radius,
      );

      const kevinLabel = this.add.text(
        kevinRect.centerX,
        kevinRect.centerY,
        "K",
        {
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: `${Math.max(10, Math.floor(cellSize * 0.62))}px`,
          fontStyle: "bold",
          color: "#090d16",
        },
      );
      kevinLabel.setOrigin(0.5, 0.5);
      this.labelsContainer.add(kevinLabel);
    }

    // 3. Marcador de la posición de prueba del explorador (diferenciado de la entrada inicial)
    const explorerStyle = getParticipantStyle(selectedPlayerIndex);
    const explorerRect = gridToScreen(explorer.position, cellSize, origin);
    const onEntrance = samePosition(explorer.position, explorer.entrance);

    if (viewMode === "lantern" || !onEntrance) {
      const tokenRadius = Math.max(3, cellSize * 0.38);
      this.explorerGraphics.fillStyle(0x090d16, 0.9);
      this.explorerGraphics.fillCircle(
        explorerRect.centerX,
        explorerRect.centerY,
        tokenRadius + 2,
      );
      this.explorerGraphics.fillStyle(explorerStyle.color, 1);
      this.explorerGraphics.fillCircle(
        explorerRect.centerX,
        explorerRect.centerY,
        tokenRadius,
      );
      this.explorerGraphics.lineStyle(2, 0xffffff, 1);
      this.explorerGraphics.strokeCircle(
        explorerRect.centerX,
        explorerRect.centerY,
        tokenRadius,
      );
    }
  }
}
