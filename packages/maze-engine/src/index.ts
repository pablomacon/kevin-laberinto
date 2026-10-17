import type { Position } from "@kevin/shared";

export interface MazeConfig {
  readonly columns: number;
  readonly rows: number;
  readonly seed: string;
  readonly entranceCount: number;
}

export interface Maze {
  readonly id: string;
  readonly config: MazeConfig;
  readonly entrances: readonly Position[];
}

export interface MazeMetrics {
  readonly isConnected: boolean;
  readonly entranceDistanceTolerance: number;
}

export interface MazeResult {
  readonly maze: Maze;
  readonly metrics: MazeMetrics;
}
