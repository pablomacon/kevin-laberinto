import {
  computeAllOptimalPaths,
  computeOptimalPath,
  getParticipantStyle,
  gridToScreen,
  type ViewerState,
} from "./viewer-logic.js";

/**
 * Genera y descarga una imagen PNG del laberinto completo a partir del estado real mostrado.
 * Incluye paredes, corredores, entradas (J1-J6), Kevin (K) y opcionalmente las rutas activas.
 */
export function exportMazeToPng(state: ViewerState): void {
  const { maze } = state;
  const { columns, rows, seed } = maze.config;
  const cellSize = Math.max(12, Math.min(28, Math.floor(1920 / columns)));
  const padding = 24;
  const headerHeight = 44;
  const width = columns * cellSize + padding * 2;
  const height = rows * cellSize + padding * 2 + headerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const origin = { x: padding, y: padding + headerHeight };

  // Fondo general
  ctx.fillStyle = "#070b14";
  ctx.fillRect(0, 0, width, height);

  // Encabezado informativo de la exportación
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "bold 16px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(
    `KEVIN EN SU LABERINTO · Semilla: ${seed} (${columns}×${rows})`,
    padding,
    padding + 14,
  );

  // 1. Terreno: paredes y corredores
  for (let row = 0; row < rows; row += 1) {
    const rowCells = maze.cells[row];
    if (!rowCells) continue;
    for (let column = 0; column < columns; column += 1) {
      const cell = rowCells[column];
      const rect = gridToScreen({ column, row }, cellSize, origin);
      ctx.fillStyle = cell === "floor" ? "#2d405e" : "#090e1a";
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

      if (state.showGrid) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
        ctx.lineWidth = 1;
        ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height);
      }
    }
  }

  // 2. Rutas óptimas (si están activas y el usuario eligió incluirlas en la exportación)
  if (state.includePathsInExport) {
    const drawPath = (
      path: readonly { readonly column: number; readonly row: number }[],
      hexColor: string,
      alpha: number,
      lineWidth: number,
    ): void => {
      if (path.length < 2) return;
      ctx.save();
      ctx.strokeStyle = hexColor;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i < path.length; i += 1) {
        const pt = gridToScreen(path[i]!, cellSize, origin);
        if (i === 0) {
          ctx.moveTo(pt.centerX, pt.centerY);
        } else {
          ctx.lineTo(pt.centerX, pt.centerY);
        }
      }
      ctx.stroke();
      ctx.restore();
    };

    if (state.showAllPaths) {
      const allPaths = computeAllOptimalPaths(maze);
      allPaths.forEach((path, idx) => {
        if (path) {
          const style = getParticipantStyle(idx);
          drawPath(path, style.hex, 0.55, Math.max(2, cellSize * 0.28));
        }
      });
    }

    if (state.showSelectedPath) {
      const selectedPath = computeOptimalPath(maze, state.selectedPlayerIndex);
      if (selectedPath) {
        const style = getParticipantStyle(state.selectedPlayerIndex);
        drawPath(selectedPath, style.hex, 0.95, Math.max(3, cellSize * 0.38));
      }
    }
  }

  // 3. Entradas J1..J6
  maze.entrances.forEach((entrance, idx) => {
    const style = getParticipantStyle(idx);
    const rect = gridToScreen(entrance, cellSize, origin);
    const isSelected = idx === state.selectedPlayerIndex;

    ctx.fillStyle = style.hex;
    ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);

    if (isSelected) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
    }

    if (state.showEntranceLabels) {
      ctx.fillStyle = "#090d16";
      ctx.font = `bold ${Math.max(9, Math.floor(cellSize * 0.52))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(style.id, rect.centerX, rect.centerY);
    }
  });

  // 4. Kevin (K)
  const kevinRect = gridToScreen(maze.kevin, cellSize, origin);
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(
    kevinRect.centerX,
    kevinRect.centerY,
    cellSize * 0.45,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.strokeStyle = "#fef08a";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#090d16";
  ctx.font = `bold ${Math.max(10, Math.floor(cellSize * 0.6))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("K", kevinRect.centerX, kevinRect.centerY);

  // Borde exterior del mapa
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 2;
  ctx.strokeRect(origin.x, origin.y, columns * cellSize, rows * cellSize);

  const safeSeed = seed.replace(/[^a-zA-Z0-9_-]/g, "_");
  const link = document.createElement("a");
  link.download = `laberinto-${safeSeed}-${columns}x${rows}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
