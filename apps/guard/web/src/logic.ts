export type LastAttempt = {
  roundId: number;
  previousGuard: string;
  openingMessage: string;
  nextGuard: string;
  output: string;
  won: boolean;
  requestId: number;
};

export function normalizeLastAttempt(raw: unknown): LastAttempt {
  if (Array.isArray(raw) && raw.length >= 4) {
    const hasRoundId = raw.length >= 7;
    return {
      roundId: Number(hasRoundId ? raw[0] ?? 0 : 0),
      previousGuard: String(raw[hasRoundId ? 1 : 0] ?? ""),
      openingMessage: String(raw[hasRoundId ? 2 : 1] ?? ""),
      nextGuard: String(raw[hasRoundId ? 3 : 2] ?? ""),
      output: String(raw[hasRoundId ? 4 : 3] ?? ""),
      won: Boolean(raw[hasRoundId ? 5 : 4]),
      requestId: Number(raw[hasRoundId ? 6 : 5] ?? 0)
    };
  }

  if (typeof raw === "object" && raw !== null) {
    const obj = raw as {
      roundId?: unknown;
      previousGuard?: unknown;
      openingMessage?: unknown;
      nextGuard?: unknown;
      output?: unknown;
      won?: unknown;
      requestId?: unknown;
    };

    return {
      roundId: Number(obj.roundId ?? 0),
      previousGuard: String(obj.previousGuard ?? ""),
      openingMessage: String(obj.openingMessage ?? ""),
      nextGuard: String(obj.nextGuard ?? ""),
      output: String(obj.output ?? ""),
      won: Boolean(obj.won),
      requestId: Number(obj.requestId ?? 0)
    };
  }

  return {
    roundId: 0,
    previousGuard: "",
    openingMessage: "",
    nextGuard: "",
    output: "",
    won: false,
    requestId: 0
  };
}

export function hasAttemptData(attempt: LastAttempt): boolean {
  return (
    attempt.previousGuard.length > 0 ||
    attempt.openingMessage.length > 0 ||
    attempt.nextGuard.length > 0 ||
    attempt.output.length > 0
  );
}
