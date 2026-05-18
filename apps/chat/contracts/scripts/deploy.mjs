import {
  createClients,
  loadArtifact,
  CURRENT_RPC_URL,
  writeDeployment
} from "./_common.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { publicClient, walletClient, account } = createClients();

const chatArtifact = loadArtifact("PublicChat", "PublicChat");
const inferenceArtifact = loadArtifact("IDecentralizedAI", "IDecentralizedAI");

const inferenceAddress = process.env.INFERENCE_ADDRESS;
if (!inferenceAddress) {
  throw new Error("INFERENCE_ADDRESS environment variable is missing!");
}

console.log(`Using existing AbraInference Oracle at: ${inferenceAddress}`);

const chatHash = await walletClient.deployContract({
  abi: chatArtifact.abi,
  bytecode: chatArtifact.bytecode.object,
  args: [inferenceAddress],
  account
});
const chatReceipt = await publicClient.waitForTransactionReceipt({
  hash: chatHash
});

const chainId = await publicClient.getChainId();
writeDeployment({
  chainId,
  rpcUrl: CURRENT_RPC_URL,
  inference: {
    address: inferenceAddress,
    abi: inferenceArtifact.abi
  },
  chat: {
    address: chatReceipt.contractAddress,
    abi: chatArtifact.abi
  }
});

console.log(`PublicChat deployed to: ${chatReceipt.contractAddress}`);
