import type { MatchPhase } from "@kevin/game-core";
import type { ParticipantId, Position } from "@kevin/shared";

export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

interface MessageBase {
  readonly protocolVersion: ProtocolVersion;
  readonly messageId: string;
}

export type ClientMessage =
  | (MessageBase & {
      readonly type: "player.join";
      readonly displayName: string;
    })
  | (MessageBase & {
      readonly type: "player.move";
      readonly direction: "up" | "down" | "left" | "right";
      readonly sequence: number;
    })
  | (MessageBase & { readonly type: "admin.start" })
  | (MessageBase & { readonly type: "admin.pause" });

export type ServerMessage =
  | (MessageBase & {
      readonly type: "player.view";
      readonly participantId: ParticipantId;
      readonly visibleCells: readonly Position[];
    })
  | (MessageBase & {
      readonly type: "match.status";
      readonly phase: MatchPhase;
    })
  | (MessageBase & {
      readonly type: "match.finished";
      readonly winnerId?: ParticipantId;
    })
  | (MessageBase & {
      readonly type: "broadcast.state";
      readonly phase: MatchPhase;
    })
  | (MessageBase & {
      readonly type: "error";
      readonly code: string;
      readonly message: string;
    });
