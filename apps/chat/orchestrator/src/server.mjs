import {
  createClients,
  loadDeployment,
  chatContract,
  inferenceContract
} from "../../contracts/scripts/_common.mjs";

const { publicClient, walletClient, account } = createClients();
const deployment = loadDeployment();

const chat = chatContract(deployment, walletClient);
const inference = inferenceContract(deployment, publicClient);

console.log("Chat Orchestrator starting...");
console.log(`Watching PublicChat at: ${deployment.chat.address}`);

async function checkPendingRequests() {
  try {
    // We can fetch all chats, or listen to events.
    // For simplicity, we just fetch all chats and see if any have a pendingRequestId > 0
    const chats = await publicClient.readContract({
      address: chat.address,
      abi: chat.abi,
      functionName: 'getChats'
    });

    for (const c of chats) {
      if (c.pendingRequestId > 0n) {
        // Check if inference is ready
        const isReady = await publicClient.readContract({
          address: inference.address,
          abi: inference.abi,
          functionName: 'isReady',
          args: [c.pendingRequestId]
        });

        if (isReady) {
          console.log(`Settling request ${c.pendingRequestId} for Chat ${c.id}...`);
          try {
            const hash = await walletClient.writeContract({
              address: chat.address,
              abi: chat.abi,
              functionName: 'settleMessage',
              args: [c.pendingRequestId],
              account
            });
            await publicClient.waitForTransactionReceipt({ hash });
            console.log(`Successfully settled request ${c.pendingRequestId}.`);
          } catch (e) {
            console.error(`Error settling request ${c.pendingRequestId}:`, e.message);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error checking pending requests:", error.message);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  while (true) {
    await checkPendingRequests();
    await sleep(500);
  }
}

main().catch(e => {
  console.error("Fatal orchestrator error:", e);
  process.exit(1);
});
