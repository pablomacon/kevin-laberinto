import type {
  MatchSummary,
  PrivateView,
  MatchEngine,
  Direction,
} from "@kevin/game-core";
export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;
interface Envelope {
  readonly protocolVersion: ProtocolVersion;
  readonly messageId: string;
}
export type ClientMessage = Envelope &
  (
    | {
        type: "room.access";
        role: "player" | "director" | "broadcast";
        token?: string;
      }
    | { type: "player.join"; displayName: string }
    | { type: "player.move"; direction: Direction; sequence: number }
    | { type: "player.reconnect"; token: string }
    | { type: "admin.start" }
    | { type: "room.create" }
  );
export type ServerMessage = Envelope &
  (
    | { type: "room.accessed"; role: "player" | "director" | "broadcast" }
    | {
        type: "player.joined";
        participantId: string;
        reconnectToken: string;
        nextSequence: number;
        matchId: string;
      }
    | { type: "match.status"; status: MatchSummary }
    | { type: "player.view"; view: PrivateView }
    | { type: "match.finished"; status: MatchSummary }
    | { type: "broadcast.state"; state: ReturnType<MatchEngine["fullState"]> }
    | { type: "error"; code: string; message: string; requestId?: string }
  );
export function parseClientMessage(value: unknown): ClientMessage | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const v = value as Record<string, unknown>;
  if (
    v.protocolVersion !== 1 ||
    typeof v.messageId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,96}$/.test(v.messageId) ||
    typeof v.type !== "string"
  )
    return null;
  const text = (s: unknown, min: number, max: number): s is string =>
    typeof s === "string" &&
    s.length >= min &&
    s.length <= max &&
    ![...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
  const allowed: Record<string, string[]> = {
    "room.access": ["role", "token"],
    "player.join": ["displayName"],
    "player.move": ["direction", "sequence"],
    "player.reconnect": ["token"],
    "admin.start": [],
    "room.create": [],
  };
  if (!Object.hasOwn(allowed, v.type)) return null;
  const fields = allowed[v.type];
  if (
    !fields ||
    Object.keys(v).some(
      (k) => !["type", "protocolVersion", "messageId", ...fields].includes(k),
    )
  )
    return null;
  switch (v.type) {
    case "room.access":
      if (
        typeof v.role !== "string" ||
        !["player", "director", "broadcast"].includes(v.role) ||
        (v.token !== undefined && !text(v.token, 32, 256))
      )
        return null;
      break;
    case "player.join":
      if (!text(v.displayName, 1, 24) || !(v.displayName as string).trim())
        return null;
      break;
    case "player.move":
      if (
        typeof v.direction !== "string" ||
        !["up", "down", "left", "right"].includes(v.direction) ||
        !Number.isSafeInteger(v.sequence) ||
        Number(v.sequence) < 0
      )
        return null;
      break;
    case "player.reconnect":
      if (!text(v.token, 32, 256)) return null;
      break;
  }
  return v as unknown as ClientMessage;
}
