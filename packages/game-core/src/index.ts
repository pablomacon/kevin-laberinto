import type { PlayerIdentity } from "@kevin/identity";
import type { Maze } from "@kevin/maze-engine";
import type { MatchId, ParticipantId, Position } from "@kevin/shared";
export * from "./engine.js";

export interface MatchParticipant {
  readonly id: ParticipantId;
  readonly identity: PlayerIdentity;
  readonly entrance: Position;
}

export interface MatchConfig {
  readonly maxParticipants: number;
  readonly movementIntervalMs: number;
  readonly visibilityRadius: number;
  readonly raceDurationSeconds: number;
  readonly countdownSeconds: number;
  readonly reconnectionGraceSeconds: number;
}

export type MatchPhase =
  "waiting" | "countdown" | "running" | "paused" | "finished";

export interface MatchState {
  readonly id: MatchId;
  readonly phase: MatchPhase;
  readonly config: MatchConfig;
  readonly maze: Maze;
  readonly participants: readonly MatchParticipant[];
}

export type MatchEvent =
  | {
      readonly type: "participant.joined";
      readonly participantId: ParticipantId;
    }
  | {
      readonly type: "participant.moved";
      readonly participantId: ParticipantId;
      readonly position: Position;
    }
  | { readonly type: "match.started" }
  | { readonly type: "match.finished"; readonly winnerId?: ParticipantId };
