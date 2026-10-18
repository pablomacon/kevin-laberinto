import { describe, expect, it } from "vitest";
import {
  BetaProtocolClient,
  type SessionStore,
} from "../apps/server-local/src/protocol-client.js";
import { parseClientMessage } from "../packages/protocol/src/index.js";

class MemoryStorage implements SessionStore {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe("BetaProtocolClient (Comunicación y sesión WebSocket)", () => {
  it("inicia acceso a sala para jugador y envía sobre protocolVersion 1", () => {
    const sent: string[] = [];
    const client = new BetaProtocolClient({
      role: "player",
      sendRaw: (data) => sent.push(data),
    });

    client.handleOpen();
    expect(sent).toHaveLength(1);

    const parsed = parseClientMessage(JSON.parse(sent[0]!));
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("room.access");
    expect((parsed as { role: string }).role).toBe("player");
  });

  it("almacena y reutiliza capacidad de director y OBS", () => {
    const storage = new MemoryStorage();
    const sent: string[] = [];
    const client = new BetaProtocolClient({
      role: "director",
      token: "secret-director-cap-12345678901234567890",
      storage,
      sendRaw: (data) => sent.push(data),
    });

    expect(storage.getItem("kevin.cap.director")).toBe(
      "secret-director-cap-12345678901234567890",
    );

    client.handleOpen();
    const parsed = parseClientMessage(JSON.parse(sent[0]!));
    expect(parsed).toMatchObject({
      type: "room.access",
      role: "director",
      token: "secret-director-cap-12345678901234567890",
    });
  });

  it("gestiona la unión de jugador y guarda token de reconexión", () => {
    const storage = new MemoryStorage();
    const sent: string[] = [];
    const client = new BetaProtocolClient({
      role: "player",
      storage,
      sendRaw: (data) => sent.push(data),
    });

    client.handleOpen();
    client.handleIncoming(
      JSON.stringify({
        protocolVersion: 1,
        messageId: "s1",
        type: "room.accessed",
        role: "player",
      }),
    );

    expect(client.join("   ")).toBe(false);
    expect(client.join("Jugador Uno")).toBe(true);
    expect(sent).toHaveLength(2); // room.access + player.join

    const joinMsg = parseClientMessage(JSON.parse(sent[1]!));
    expect(joinMsg).toMatchObject({
      type: "player.join",
      displayName: "Jugador Uno",
    });

    client.handleIncoming(
      JSON.stringify({
        protocolVersion: 1,
        messageId: "s2",
        type: "player.joined",
        participantId: "p-100",
        reconnectToken: "tok-abc-123",
        nextSequence: 0,
        matchId: "match-42",
      }),
    );

    expect(client.getParticipantId()).toBe("p-100");
    expect(client.getMatchId()).toBe("match-42");
    expect(client.getReconnectToken()).toBe("tok-abc-123");
    expect(storage.getItem("kevin.session")).toBe("tok-abc-123");
  });

  it("solicita reconexión automática si existe un token previo en sessionStorage", () => {
    const storage = new MemoryStorage();
    const validToken = "token-guardado-previamente-con-mas-de-32-chars";
    storage.setItem("kevin.session", validToken);

    const sent: string[] = [];
    const client = new BetaProtocolClient({
      role: "player",
      storage,
      sendRaw: (data) => sent.push(data),
    });

    client.handleOpen();
    client.handleIncoming(
      JSON.stringify({
        protocolVersion: 1,
        messageId: "s1",
        type: "room.accessed",
        role: "player",
      }),
    );

    expect(sent).toHaveLength(2);
    const reconnectMsg = parseClientMessage(JSON.parse(sent[1]!));
    expect(reconnectMsg).toMatchObject({
      type: "player.reconnect",
      token: validToken,
    });
  });

  it("incrementa secuencias monótonas en movimientos y emite el formato correcto", () => {
    const storage = new MemoryStorage();
    const sent: string[] = [];
    const client = new BetaProtocolClient({
      role: "player",
      storage,
      sendRaw: (data) => sent.push(data),
    });

    client.handleIncoming(
      JSON.stringify({
        protocolVersion: 1,
        messageId: "s2",
        type: "player.joined",
        participantId: "p-1",
        reconnectToken: "tok",
        nextSequence: 5,
        matchId: "m-1",
      }),
    );

    expect(client.getSequence()).toBe(5);

    const seq1 = client.move("right");
    expect(seq1).toBe(5);
    const seq2 = client.move("up");
    expect(seq2).toBe(6);

    const m1 = parseClientMessage(JSON.parse(sent[0]!));
    const m2 = parseClientMessage(JSON.parse(sent[1]!));

    expect(m1).toMatchObject({
      type: "player.move",
      direction: "right",
      sequence: 5,
    });
    expect(m2).toMatchObject({
      type: "player.move",
      direction: "up",
      sequence: 6,
    });
  });

  it("invalida la sesión almacenada si la partida cambia o se rechaza la reconexión", () => {
    const storage = new MemoryStorage();
    storage.setItem("kevin.session", "token-valido");

    const client = new BetaProtocolClient({
      role: "player",
      storage,
      sendRaw: () => {},
    });

    client.handleIncoming(
      JSON.stringify({
        protocolVersion: 1,
        messageId: "s1",
        type: "player.joined",
        participantId: "p-1",
        reconnectToken: "token-valido",
        nextSequence: 0,
        matchId: "carrera-1",
      }),
    );

    expect(storage.getItem("kevin.session")).toBe("token-valido");

    // Cuando el servidor anuncia una carrera nueva con otro matchId
    client.handleIncoming(
      JSON.stringify({
        protocolVersion: 1,
        messageId: "s2",
        type: "match.status",
        status: {
          matchId: "carrera-2-nueva",
          phase: "waiting",
          remainingMs: 240000,
          countdownMs: 3000,
          participants: [],
        },
      }),
    );

    expect(storage.getItem("kevin.session")).toBeNull();
    expect(client.getParticipantId()).toBeNull();

    // Error de sesión inválida
    storage.setItem("kevin.session", "token-invalido");
    client.handleIncoming(
      JSON.stringify({
        protocolVersion: 1,
        messageId: "s3",
        type: "error",
        code: "INVALID_SESSION",
        message: "Sesión inválida",
      }),
    );

    expect(storage.getItem("kevin.session")).toBeNull();
  });
});
