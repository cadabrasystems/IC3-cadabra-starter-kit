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

const guardArtifact = loadArtifact("GuardGame", "GuardGame");
const inferenceArtifact = loadArtifact("IDecentralizedAI", "IDecentralizedAI");

const inferenceAddress = process.env.INFERENCE_ADDRESS;
if (!inferenceAddress) {
  throw new Error("INFERENCE_ADDRESS environment variable is missing!");
}

console.log(`Using existing CadabraInference at: ${inferenceAddress}`);

const guardHash = await walletClient.deployContract({
  abi: guardArtifact.abi,
  bytecode: guardArtifact.bytecode.object,
  args: [inferenceAddress],
  account
});
const guardReceipt = await publicClient.waitForTransactionReceipt({
  hash: guardHash
});

// Use a public RPC for the frontend config - don't leak private API keys
const PUBLIC_RPC_URLS = {
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  84532: "https://base-sepolia-rpc.publicnode.com",
};
const chainId = await publicClient.getChainId();
const frontendRpcUrl = PUBLIC_RPC_URLS[chainId] || CURRENT_RPC_URL;

writeDeployment({
  chainId,
  rpcUrl: frontendRpcUrl,
  inference: {
    address: inferenceAddress,
    abi: inferenceArtifact.abi
  },
  guard: {
    address: guardReceipt.contractAddress,
    abi: guardArtifact.abi
  }
});

console.log(`GuardGame deployed to: ${guardReceipt.contractAddress}`);
