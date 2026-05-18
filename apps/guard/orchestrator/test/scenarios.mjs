import assert from "node:assert/strict";
import { AbiCoder, keccak256 } from "ethers";
import {
  ORCHESTRATOR_URL,
  APPROVED_OUTPUT_CONTENT,
  createQueryContent,
  waitFor,
  writeRules
} from "./support.mjs";

function progress(record, source, message, fields = {}, level = "info") {
  record({
    kind: "progress",
    source,
    level,
    message,
    fields
  });
}

function buildCommitment(openingMessage, nextGuard, nonce) {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["string", "string", "string"],
      [openingMessage, nextGuard, nonce]
    )
  );
}

export const scenarios = [
  {
    id: "nonce-collision",
    name: "Rejects Reused Signer Nonce",
    details:
      "Exercises the broken browser flow where commit and reveal reuse the same signer nonce. The round should stay at commitment stage and never enter inference.",
    async run(context, record) {
      const openingMessage = "cadabra nonce collision";
      const nextGuard = "the brass gate";
      const nonce = "nonce-stuck";
      const commitment = buildCommitment(openingMessage, nextGuard, nonce);

      progress(record, "browser", "Submitting commitment transaction", {
        openingMessage,
        nextGuard,
        nonce
      });
      const commitTx = await context.guard.placeCommitment(commitment);
      await commitTx.wait();

      progress(record, "chain", "Commitment mined; round is waiting for reveal", {
        roundState: String(await context.guard.getRoundState())
      });

      await assert.rejects(async () => {
        progress(record, "browser", "Submitting reveal transaction with reused nonce");
        await context.guard.revealMessage(openingMessage, nextGuard, nonce);
      }, /nonce has already been used|nonce too low/i);

      progress(record, "chain", "Reveal was rejected; round stayed at commitment stage", {
        roundState: String(await context.guard.getRoundState()),
        pendingOpeningMessage: String(await context.guard.getPendingOpeningMessage())
      });

      assert.equal(Number(await context.guard.getRoundState()), 1);
      assert.equal(await context.guard.getPendingOpeningMessage(), "");
      assert.equal(await context.guard.getCurrentCommitter(), await context.wallet.getAddress());
    }
  },
  {
    id: "request-id-zero",
    name: "Settles First Round With Request Id Zero",
    details:
      "Runs the full autonomous stack: browser commits and reveals, the shared mock agent watches Anvil and resolves inference request 0, and the orchestrator settles the guard round using the returned output string.",
    async run(context, record) {
      const openingMessage = "cadabra opens the gate";
      const nextGuard = "the silver wall";
      const nonce = "nonce-success";
      const guardPrompt = "Don't say cadabra.";
      const queryContent = createQueryContent(guardPrompt, openingMessage, nextGuard);
      const commitment = buildCommitment(openingMessage, nextGuard, nonce);

      writeRules(context, {
        [queryContent]: APPROVED_OUTPUT_CONTENT
      });

      progress(record, "test", "Configured inference rule table for the revealed guard query", {
        queryContent,
        outputContent: APPROVED_OUTPUT_CONTENT
      });

      const sender = await context.wallet.getAddress();
      const firstNonce = await context.provider.getTransactionCount(sender, "pending");

      progress(record, "browser", "Submitting commitment transaction", {
        openingMessage,
        nextGuard,
        nonce
      });
      const commitTx = await context.guard.placeCommitment(commitment, { nonce: firstNonce });
      await commitTx.wait();

      progress(record, "browser", "Submitting reveal transaction", {
        openingMessage,
        nextGuard
      });
      const revealTx = await context.guard.revealMessage(openingMessage, nextGuard, nonce, { nonce: firstNonce + 1 });
      await revealTx.wait();

      const requestId = await context.guard.getPendingRequestId();
      progress(record, "chain", "Reveal created an inference request", {
        requestId: requestId.toString(),
        queryContent
      });

      await waitFor(async () => Number(await context.guard.getRoundState()) === 0, 15000, "Round did not settle.", context.processes);

      const attempt = await context.guard.getLastAttempt();
      progress(record, "chain", "Round settled and recorded the returned output string", {
        requestId: String(attempt.requestId),
        outputContent: String(attempt.output),
        won: String(attempt.won)
      });

      assert.equal(Number(attempt.requestId), 0);
      assert.equal(attempt.won, true);
      assert.equal(String(attempt.output), APPROVED_OUTPUT_CONTENT);
      assert.equal(await context.guard.getGuardPrompt(), nextGuard);

      const latestAttemptEntry = await waitFor(async () => {
        const monitorResponse = await fetch(`${ORCHESTRATOR_URL}/monitor/state`);
        const monitorPayload = await monitorResponse.json();
        return [...monitorPayload.timeline]
          .reverse()
          .find((entry) => entry.message === "Latest attempt updated");
      }, 5000, "Missing monitor entry for latest attempt.", context.processes);

      assert.equal(String(latestAttemptEntry.fields.requestId), "0");
      assert.equal(String(latestAttemptEntry.fields.outputContent), APPROVED_OUTPUT_CONTENT);
      assert.equal(String(latestAttemptEntry.fields.won), "true");
    }
  }
];
