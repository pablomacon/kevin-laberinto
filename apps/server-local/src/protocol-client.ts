import type { ServerMessage } from "@kevin/protocol";
import type { Direction } from "@kevin/game-core";

export type ClientRole = "player" | "director" | "broadcast";

export interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ClientPayload =
  | { type: "room.access"; role: ClientRole; token?: string }
  | { type: "player.join"; displayName: string }
  | { type: "player.move"; direction: Direction; sequence: number }
  | { type: "player.reconnect"; token: string }
  | { type: "admin.start" }
  | { type: "room.create" };

export interface BetaProtocolClientOptions {
  readonly role: ClientRole;
  readonly token?: string | undefined;
  readonly storage?: SessionStore | undefined;
  readonly sendRaw: (data: string) => void;
  readonly onMessage?: ((message: ServerMessage) => void) | undefined;
  readonly onStatusChange?: ((status: string) => void) | undefined;
}

export class BetaProtocolClient {
  public readonly role: ClientRole;
  private readonly storage: SessionStore | undefined;
  private readonly sendRaw: (data: string) => void;
  private readonly onMessageCallback:
    ((message: ServerMessage) => void) | undefined;
  private readonly onStatusChangeCallback:
    ((status: string) => void) | undefined;

  private messageCounter = 0;
  private nextSequence = 0;
  private currentMatchId: string | null = null;
  private participantId: string | null = null;
  private reconnectToken: string | null = null;
  private roleToken: string;

  public constructor(options: BetaProtocolClientOptions) {
    this.role = options.role;
    this.storage = options.storage;
    this.sendRaw = options.sendRaw;
    this.onMessageCallback = options.onMessage;
    this.onStatusChangeCallback = options.onStatusChange;

    const storedCap =
      this.role !== "player"
        ? (this.storage?.getItem(`kevin.cap.${this.role}`) ?? "")
        : "";
    this.roleToken = options.token || storedCap;
    if (this.role !== "player" && this.roleToken && this.storage) {
      this.storage.setItem(`kevin.cap.${this.role}`, this.roleToken);
    }
  }

  public getSequence(): number {
    return this.nextSequence;
  }

  public getParticipantId(): string | null {
    return this.participantId;
  }

  public getMatchId(): string | null {
    return this.currentMatchId;
  }

  public getReconnectToken(): string | null {
    return (
      this.reconnectToken ?? this.storage?.getItem("kevin.session") ?? null
    );
  }

  public handleOpen(): void {
    const payload: ClientPayload =
      this.role !== "player" && this.roleToken
        ? { type: "room.access", role: this.role, token: this.roleToken }
        : { type: "room.access", role: this.role };
    this.send(payload);
  }

  public handleIncoming(rawText: string): ServerMessage | null {
    let message: ServerMessage;
    try {
      message = JSON.parse(rawText) as ServerMessage;
    } catch {
      return null;
    }

    switch (message.type) {
      case "room.accessed": {
        if (this.role === "player") {
          const savedToken = this.storage?.getItem("kevin.session");
          if (savedToken) {
            this.send({
              type: "player.reconnect",
              token: savedToken,
            });
          }
        }
        this.onStatusChangeCallback?.("Conectado");
        break;
      }

      case "player.joined": {
        this.participantId = message.participantId;
        this.reconnectToken = message.reconnectToken;
        this.nextSequence = message.nextSequence;
        this.currentMatchId = message.matchId;
        this.storage?.setItem("kevin.session", message.reconnectToken);
        this.onStatusChangeCallback?.("En sala");
        break;
      }

      case "match.status": {
        if (
          this.currentMatchId &&
          this.currentMatchId !== message.status.matchId
        ) {
          this.clearSession();
          this.currentMatchId = message.status.matchId;
        } else if (!this.currentMatchId) {
          this.currentMatchId = message.status.matchId;
        }
        break;
      }

      case "match.finished": {
        this.onStatusChangeCallback?.("Finalizada");
        break;
      }

      case "error": {
        if (
          [
            "INVALID_SESSION",
            "UNKNOWN_PLAYER",
            "RECONNECT_EXPIRED",
            "ROOM_FULL",
          ].includes(message.code)
        ) {
          this.clearSession();
        }
        this.onStatusChangeCallback?.(`Error: ${message.code}`);
        break;
      }
    }

    this.onMessageCallback?.(message);
    return message;
  }

  public join(displayName: string): boolean {
    if (this.role !== "player") return false;
    const trimmed = displayName.trim();
    if (!trimmed || trimmed.length > 24) return false;
    this.send({
      type: "player.join",
      displayName: trimmed,
    });
    return true;
  }

  public reconnect(token: string): void {
    if (this.role !== "player") return;
    this.send({
      type: "player.reconnect",
      token,
    });
  }

  public move(direction: Direction): number {
    if (this.role !== "player") return -1;
    const seq = this.nextSequence;
    this.nextSequence += 1;
    this.send({
      type: "player.move",
      direction,
      sequence: seq,
    });
    return seq;
  }

  public startMatch(): void {
    if (this.role === "director") {
      this.send({ type: "admin.start" });
    }
  }

  public createRoom(): void {
    if (this.role === "director") {
      this.send({ type: "room.create" });
    }
  }

  public clearSession(): void {
    this.storage?.removeItem("kevin.session");
    this.participantId = null;
    this.reconnectToken = null;
    this.nextSequence = 0;
  }

  private send(payload: ClientPayload): void {
    this.messageCounter += 1;
    const msg = {
      protocolVersion: 1 as const,
      messageId: `c-${this.messageCounter}`,
      ...payload,
    };
    this.sendRaw(JSON.stringify(msg));
  }
}
