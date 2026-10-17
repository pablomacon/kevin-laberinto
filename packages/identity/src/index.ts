export type PlayerIdentity = GuestIdentity | RegisteredIdentity;

export interface GuestIdentity {
  readonly kind: "guest";
  readonly guestId: string;
  readonly displayName: string;
}

/** Contrato reservado para la futura identidad con cuenta. */
export interface RegisteredIdentity {
  readonly kind: "registered";
  readonly userId: string;
  readonly displayName: string;
}
