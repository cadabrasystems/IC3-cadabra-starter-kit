import { createPublicClient, createWalletClient, getContract, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard Anvil default RPC and private key (Account #0)
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Load the deployment config
const deploymentPath = path.join(__dirname, "../localhost.json");
let deployment;
try {
  deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
} catch (e) {
  console.error("Failed to read localhost.json. Did you deploy the contract first?");
  process.exit(1);
}

const inferenceService = deployment.inference;

const account = privateKeyToAccount(PRIVATE_KEY);
const transport = http(RPC_URL);
const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ account, transport });

const inference = getContract({
  address: inferenceService.address,
  abi: inferenceService.abi,
  client: { public: publicClient, wallet: walletClient }
});

const inferenceRequestedEvent = parseAbiItem(
  "event InferenceRequested(uint256 indexed requestId, string query)"
);

console.log(`Agent started. Listening for requests on ${inferenceService.address}...`);

// =========================================================================
// CUSTOMIZE YOUR AI LOGIC HERE
// =========================================================================
async function getAgentResponse(query) {
  console.log(`\n[Agent] Received query: "${query}"`);
  
  // TO DO: Replace this mock implementation with an actual call to your 
  // preferred AI provider (e.g., OpenAI, Anthropic, Ollama API, etc.)
  
  const mockResponse = `[Mock Agent Reply] I received your prompt: "${query}".\n\nTo make me smarter for your testing, open local-setup/agent/agent.mjs and replace getAgentResponse() with your own logic to call OpenAI, Anthropic, or a local Ollama model!`;
  
  console.log(`[Agent] Answering with: "${mockResponse}"`);
  return mockResponse;
}
// =========================================================================

let lastCheckedBlock = await publicClient.getBlockNumber();

async function pollEvents() {
  try {
    const currentBlock = await publicClient.getBlockNumber();
    if (currentBlock <= lastCheckedBlock) return;

    const logs = await publicClient.getLogs({
      address: inferenceService.address,
      event: inferenceRequestedEvent,
      fromBlock: lastCheckedBlock + 1n,
      toBlock: currentBlock
    });

    for (const log of logs) {
      const { requestId, query } = log.args;
      
      // Get the response from the AI
      const answer = await getAgentResponse(query);
      
      // 1. Propose the result with the required bond (0.001 ETH)
      const proposeHash = await inference.write.proposeResult([requestId, answer], {
        value: 10n ** 15n, // 0.001 ETH
        account
      });
      await publicClient.waitForTransactionReceipt({ hash: proposeHash });
      console.log(`[Agent] Proposed result for request ${requestId} (Tx: ${proposeHash})`);

      // 2. Fast-forward time so the challenge window (if any) closes. 
      // CadabraInference has a CHALLENGE_WINDOW of 0, but we still need to mine a block.
      try {
        await publicClient.transport.request({ method: "evm_mine", params: [] });
      } catch (e) {
        // Not running on a local testnet that supports evm_mine
      }

      // 3. Resolve to finalize the result
      const resolveHash = await inference.write.resolve([requestId], { account });
      await publicClient.waitForTransactionReceipt({ hash: resolveHash });
      console.log(`[Agent] Resolved request ${requestId} (Tx: ${resolveHash})`);
    }

    lastCheckedBlock = currentBlock;
  } catch (err) {
    console.error("Polling error:", err);
  }
}

setInterval(pollEvents, 2000);
