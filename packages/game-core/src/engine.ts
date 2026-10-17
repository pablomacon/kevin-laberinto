import { isTraversable, type Maze, type Terrain } from "@kevin/maze-engine";
import type { Position } from "@kevin/shared";
import type { MatchConfig, MatchPhase } from "./index.js";

export interface Clock {
  now(): number;
}
export type Direction = "up" | "down" | "left" | "right";
export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  maxParticipants: 6,
  movementIntervalMs: 150,
  visibilityRadius: 4,
  raceDurationSeconds: 240,
  countdownSeconds: 3,
  reconnectionGraceSeconds: 30,
};
export interface PublicParticipant {
  id: string;
  displayName: string;
  connected: boolean;
  expired: boolean;
}
export interface CellView extends Position {
  terrain: Terrain;
}
export interface PrivateView {
  matchId: string;
  participantId: string;
  phase: MatchPhase;
  position: Position;
  columns: number;
  rows: number;
  visible: CellView[];
  explored: CellView[];
  kevin?: Position;
  remainingMs: number;
  countdownMs: number;
}
export interface Progress {
  participantId: string;
  displayName: string;
  steps: number;
  exploredCells: number;
  exploredPercent: number;
}
export interface MatchSummary {
  matchId: string;
  phase: MatchPhase;
  participants: PublicParticipant[];
  remainingMs: number;
  countdownMs: number;
  winnerId?: string;
  results?: Progress[];
}
interface Player extends PublicParticipant {
  position: Position;
  entrance: Position;
  disconnectedAt: number | null;
  lastMove: number;
  explored: Set<string>;
  steps: number;
}
const key = (p: Position): string => `${p.column},${p.row}`;
export class MatchError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
/** Estado autoritativo puro. El orden de llamadas del coordinador desempata llegadas. */
export class MatchEngine {
  private readonly maze: Maze;
  private readonly players = new Map<string, Player>();
  private phase: MatchPhase = "waiting";
  private startsAt = 0;
  private winnerId: string | undefined;
  readonly config: MatchConfig;
  constructor(
    readonly matchId: string,
    maze: Maze,
    private readonly clock: Clock,
    config: Partial<MatchConfig> = {},
  ) {
    this.maze = structuredClone(maze);
    this.config = { ...DEFAULT_MATCH_CONFIG, ...config };
    if (
      !Number.isInteger(this.config.maxParticipants) ||
      this.config.maxParticipants < 3 ||
      this.config.maxParticipants > 6 ||
      maze.entrances.length < this.config.maxParticipants ||
      [
        this.config.movementIntervalMs,
        this.config.visibilityRadius,
        this.config.raceDurationSeconds,
        this.config.countdownSeconds,
        this.config.reconnectionGraceSeconds,
      ].some((n) => !Number.isFinite(n) || n <= 0)
    )
      throw new MatchError("INVALID_CONFIG");
  }
  join(id: string, displayName: string): void {
    this.tick();
    if (this.phase !== "waiting") throw new MatchError("MATCH_STARTED");
    if (this.players.has(id)) throw new MatchError("ALREADY_JOINED");
    if (this.players.size >= this.config.maxParticipants)
      throw new MatchError("ROOM_FULL");
    const entrance = this.maze.entrances.find(
      (p) =>
        ![...this.players.values()].some((v) => key(v.entrance) === key(p)),
    )!;
    const player: Player = {
      id,
      displayName,
      connected: true,
      expired: false,
      position: { ...entrance },
      entrance: { ...entrance },
      disconnectedAt: null,
      lastMove: -Infinity,
      explored: new Set(),
      steps: 0,
    };
    this.players.set(id, player);
    this.illuminate(player);
  }
  start(): void {
    this.tick();
    if (this.phase !== "waiting") throw new MatchError("INVALID_PHASE");
    if (
      this.players.size < 3 ||
      [...this.players.values()].some((p) => !p.connected)
    )
      throw new MatchError("NOT_READY");
    this.startsAt = this.clock.now() + this.config.countdownSeconds * 1000;
    this.phase = "countdown";
  }
  tick(): void {
    const now = this.clock.now();
    for (const p of this.players.values())
      if (
        p.disconnectedAt !== null &&
        now - p.disconnectedAt >= this.config.reconnectionGraceSeconds * 1000
      ) {
        p.expired = true;
        if (this.phase === "waiting") this.players.delete(p.id);
      }
    if (this.phase === "countdown" && now >= this.startsAt)
      this.phase = "running";
    if (
      this.phase === "running" &&
      now >= this.startsAt + this.config.raceDurationSeconds * 1000
    )
      this.phase = "finished";
  }
  move(id: string, direction: Direction): void {
    this.tick();
    const player = this.player(id);
    if (this.phase !== "running") throw new MatchError("NOT_RUNNING");
    if (!player.connected || player.expired)
      throw new MatchError("DISCONNECTED");
    if (this.clock.now() - player.lastMove < this.config.movementIntervalMs)
      throw new MatchError("MOVE_TOO_FAST");
    // Los intentos inválidos también consumen la frecuencia; no puede sondearse toda la vecindad en un tick.
    player.lastMove = this.clock.now();
    const offsets: Record<Direction, readonly [number, number]> = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    };
    const offset = offsets[direction];
    if (!offset) throw new MatchError("INVALID_DIRECTION");
    const next = {
      column: player.position.column + offset[0],
      row: player.position.row + offset[1],
    };
    if (!isTraversable(this.maze, next)) throw new MatchError("BLOCKED");
    player.position = next;
    player.steps++;
    this.illuminate(player);
    if (key(next) === key(this.maze.kevin)) {
      this.winnerId = id;
      this.phase = "finished";
    }
  }
  disconnect(id: string): void {
    const p = this.player(id);
    if (p.connected) {
      p.connected = false;
      p.disconnectedAt = this.clock.now();
    }
  }
  reconnect(id: string): void {
    this.tick();
    const p = this.player(id);
    if (p.expired) throw new MatchError("RECONNECT_EXPIRED");
    if (p.connected) throw new MatchError("ALREADY_CONNECTED");
    p.connected = true;
    p.disconnectedAt = null;
  }
  private player(id: string): Player {
    const player = this.players.get(id);
    if (!player) throw new MatchError("UNKNOWN_PLAYER");
    return player;
  }
  private visible(player: Player): CellView[] {
    const cells: CellView[] = [];
    const radius = this.config.visibilityRadius;
    for (
      let row = Math.max(0, Math.ceil(player.position.row - radius));
      row <= Math.min(this.maze.config.rows - 1, player.position.row + radius);
      row++
    )
      for (
        let column = Math.max(0, Math.ceil(player.position.column - radius));
        column <=
        Math.min(this.maze.config.columns - 1, player.position.column + radius);
        column++
      )
        if (
          (row - player.position.row) ** 2 +
            (column - player.position.column) ** 2 <=
          radius ** 2
        )
          cells.push({ column, row, terrain: this.maze.cells[row]![column]! });
    return cells;
  }
  private illuminate(p: Player): void {
    for (const cell of this.visible(p)) p.explored.add(key(cell));
  }
  summary(): MatchSummary {
    this.tick();
    const now = this.clock.now();
    return {
      matchId: this.matchId,
      phase: this.phase,
      participants: [...this.players.values()].map(
        ({ id, displayName, connected, expired }) => ({
          id,
          displayName,
          connected,
          expired,
        }),
      ),
      countdownMs:
        this.phase === "countdown" ? Math.max(0, this.startsAt - now) : 0,
      remainingMs:
        this.phase === "running"
          ? Math.max(
              0,
              this.startsAt + this.config.raceDurationSeconds * 1000 - now,
            )
          : this.phase === "finished"
            ? 0
            : this.config.raceDurationSeconds * 1000,
      ...(this.winnerId ? { winnerId: this.winnerId } : {}),
      ...(this.phase === "finished"
        ? {
            results: [...this.players.values()].map((p) => ({
              participantId: p.id,
              displayName: p.displayName,
              steps: p.steps,
              exploredCells: p.explored.size,
              exploredPercent:
                p.explored.size /
                (this.maze.config.columns * this.maze.config.rows),
            })),
          }
        : {}),
    };
  }
  view(id: string): PrivateView {
    const summary = this.summary(),
      p = this.player(id),
      visible = this.visible(p);
    const explored = [...p.explored].map((id) => {
      const [column, row] = id.split(",").map(Number) as [number, number];
      return { column, row, terrain: this.maze.cells[row]![column]! };
    });
    return {
      matchId: this.matchId,
      participantId: id,
      phase: summary.phase,
      position: { ...p.position },
      columns: this.maze.config.columns,
      rows: this.maze.config.rows,
      visible,
      explored,
      remainingMs: summary.remainingMs,
      countdownMs: summary.countdownMs,
      ...(visible.some((cell) => key(cell) === key(this.maze.kevin))
        ? { kevin: { ...this.maze.kevin } }
        : {}),
    };
  }
  fullState(): {
    summary: MatchSummary;
    maze: Maze;
    positions: { participantId: string; position: Position }[];
  } {
    return structuredClone({
      summary: this.summary(),
      maze: this.maze,
      positions: [...this.players.values()].map((p) => ({
        participantId: p.id,
        position: p.position,
      })),
    });
  }
}
