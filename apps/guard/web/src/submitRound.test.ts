import { AbiCoder, keccak256 } from "ethers";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendWithFreshNonce, submitGuardRound } from "./submitRound";

describe("sendWithFreshNonce", () => {
  const provider = {
    getTransactionCount: vi.fn()
  };

  beforeEach(() => {
    provider.getTransactionCount.mockReset();
  });

  it("retries when the rpc reports a nonce conflict", async () => {
    provider.getTransactionCount
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(8);

    const wait = vi.fn().mockResolvedValue(undefined);
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("nonce has already been used"))
      .mockResolvedValueOnce({ wait });

    await sendWithFreshNonce(provider as never, "0xabc", send);

    expect(provider.getTransactionCount).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, 7);
    expect(send).toHaveBeenNthCalledWith(2, 8);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("throws immediately for non-nonce errors", async () => {
    provider.getTransactionCount.mockResolvedValue(4);
    const send = vi.fn().mockRejectedValue(new Error("execution reverted"));

    await expect(sendWithFreshNonce(provider as never, "0xabc", send)).rejects.toThrow(
      "execution reverted"
    );

    expect(provider.getTransactionCount).toHaveBeenCalledTimes(1);
  });
});

describe("submitGuardRound", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uses explicit fresh nonces for commit and reveal", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const getAddress = vi.fn().mockResolvedValue("0x123");
    const provider = {
      getTransactionCount: vi
        .fn()
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(11)
    };
    const placeWait = vi.fn().mockResolvedValue(undefined);
    const revealWait = vi.fn().mockResolvedValue(undefined);
    const placeCommitment = vi.fn().mockResolvedValue({ wait: placeWait });
    const revealMessage = vi.fn().mockResolvedValue({ wait: revealWait });
    const statuses: string[] = [];
    const createContract = vi.fn(() => ({
      placeCommitment,
      revealMessage
    }));

    await submitGuardRound({
      deployment: {
        guard: {
          address: "0xguard",
          abi: []
        }
      },
      provider: provider as never,
      signer: { getAddress } as never,
      orchestratorUrl: "http://127.0.0.1:8787",
      openingMessage: "cadabra",
      nextGuard: "silver gate",
      randomNonce: "nonce-1",
      setStatus: (status) => statuses.push(status),
      createContract: createContract as never
    });

    expect(global.fetch).toHaveBeenNthCalledWith(1, "http://127.0.0.1:8787/health");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/monitor/events",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(createContract).toHaveBeenCalledTimes(1);
    expect(getAddress).toHaveBeenCalledTimes(1);
    expect(placeCommitment).toHaveBeenCalledWith(
      keccak256(
        AbiCoder.defaultAbiCoder().encode(
          ["string", "string", "string"],
          ["cadabra", "silver gate", "nonce-1"]
        )
      ),
      { nonce: 10 }
    );
    expect(revealMessage).toHaveBeenCalledWith("cadabra", "silver gate", "nonce-1", { nonce: 11 });
    expect(statuses).toEqual([
      "Step 1 of 2: Sign the hidden commitment in your wallet.",
      "Step 2 of 2: Sign the reveal in your wallet.",
      "Reveal accepted. Waiting for inference and the orchestrator to finish the round."
    ]);
  });

  it("fails fast when the orchestrator is unavailable", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 503 }));

    await expect(
      submitGuardRound({
        deployment: {
          guard: {
            address: "0xguard",
            abi: []
          }
        },
        provider: { getTransactionCount: vi.fn() } as never,
        signer: { getAddress: vi.fn() } as never,
        orchestratorUrl: "http://127.0.0.1:8787",
        openingMessage: "cadabra",
        nextGuard: "silver gate",
        randomNonce: "nonce-1",
        setStatus: vi.fn()
      })
    ).rejects.toThrow("Orchestrator is unavailable.");
  });

  it("does not fail when monitor reporting is unavailable", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockRejectedValueOnce(new Error("monitor down"))
      .mockRejectedValueOnce(new Error("monitor down"))
      .mockRejectedValueOnce(new Error("monitor down"));

    const getAddress = vi.fn().mockResolvedValue("0x123");
    const provider = {
      getTransactionCount: vi
        .fn()
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(11)
    };
    const placeWait = vi.fn().mockResolvedValue(undefined);
    const revealWait = vi.fn().mockResolvedValue(undefined);
    const placeCommitment = vi.fn().mockResolvedValue({ wait: placeWait });
    const revealMessage = vi.fn().mockResolvedValue({ wait: revealWait });

    await submitGuardRound({
      deployment: {
        guard: {
          address: "0xguard",
          abi: []
        }
      },
      provider: provider as never,
      signer: { getAddress } as never,
      orchestratorUrl: "http://127.0.0.1:8787",
      openingMessage: "cadabra",
      nextGuard: "silver gate",
      randomNonce: "nonce-1",
      setStatus: vi.fn(),
      createContract: (() => ({
        placeCommitment,
        revealMessage
      })) as never
    });

    expect(placeCommitment).toHaveBeenCalledTimes(1);
    expect(revealMessage).toHaveBeenCalledTimes(1);
  });
});
