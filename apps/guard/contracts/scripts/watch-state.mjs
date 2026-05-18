import {
  createClients,
  guardContract,
  loadDeployment,
  inferenceContract
} from "./_common.mjs";

const deployment = loadDeployment();
const { publicClient } = createClients();
const guard = guardContract(deployment, publicClient);
const inference = inferenceContract(deployment, publicClient);

let prevState = -1;
let prevGuard = "";
let prevReady = "";

async function printState() {
  try {
    const state = Number(await guard.read.getRoundState());
    const guardPrompt = String(await guard.read.getGuardPrompt());
    const requestId = Number(await guard.read.getPendingRequestId());
    const ready =
      state === 2 ? String(await inference.read.isReady([BigInt(requestId)])) : "false";
    const ts = new Date().toISOString();

    if (prevState === -1) {
      console.log(
        `[${ts}] state=${state} guard='${guardPrompt}' requestId=${requestId} ready=${ready}`
      );
    } else if (state !== prevState || guardPrompt !== prevGuard || ready !== prevReady) {
      const openingMessage = String(await guard.read.getPendingOpeningMessage());
      const nextGuard = String(await guard.read.getPendingNextGuard());
      console.log(
        `[${ts}] state=${state} guard='${guardPrompt}' opening='${openingMessage}' nextGuard='${nextGuard}' requestId=${requestId} ready=${ready}`
      );
    }

    prevState = state;
    prevGuard = guardPrompt;
    prevReady = ready;
  } catch (error) {
    console.error("Failed to read contract state:", error);
  }
}

console.log(`Watching GuardGame at ${deployment.guard.address}`);
console.log("Press Ctrl+C to stop.");
await printState();

const timer = setInterval(() => {
  void printState();
}, 2000);

process.on("SIGINT", () => {
  clearInterval(timer);
  console.log("\nStopped state watcher.");
  process.exit(0);
});
