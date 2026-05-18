import { describe, expect, it } from "vitest";
import { hasAttemptData, normalizeLastAttempt } from "./logic";

describe("normalizeLastAttempt", () => {
  it("normalizes array-style attempt", () => {
    expect(normalizeLastAttempt(["g", "m", "n", "o", true])).toEqual({
      roundId: 0,
      previousGuard: "g",
      openingMessage: "m",
      nextGuard: "n",
      output: "o",
      won: true,
      requestId: 0
    });
  });

  it("normalizes object-style attempt", () => {
    expect(
      normalizeLastAttempt({
        roundId: 3,
        previousGuard: "g",
        openingMessage: "m",
        nextGuard: "n",
        output: "o",
        won: true
      })
    ).toEqual({
      roundId: 3,
      previousGuard: "g",
      openingMessage: "m",
      nextGuard: "n",
      output: "o",
      won: true,
      requestId: 0
    });
  });

  it("handles invalid shapes", () => {
    expect(normalizeLastAttempt(null)).toEqual({
      roundId: 0,
      previousGuard: "",
      openingMessage: "",
      nextGuard: "",
      output: "",
      won: false,
      requestId: 0
    });
  });
});

describe("hasAttemptData", () => {
  it("returns true when attempt contains text", () => {
    expect(
      hasAttemptData({
        roundId: 0,
        previousGuard: "g",
        openingMessage: "",
        nextGuard: "",
        output: "",
        won: false,
        requestId: 0
      })
    ).toBe(true);
  });

  it("returns false when attempt is empty", () => {
    expect(
      hasAttemptData({
        roundId: 0,
        previousGuard: "",
        openingMessage: "",
        nextGuard: "",
        output: "",
        won: false,
        requestId: 0
      })
    ).toBe(false);
  });
});
