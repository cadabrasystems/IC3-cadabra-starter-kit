import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  getContract,
  http
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTRACTS_DIR = path.resolve(__dirname, "..");
const ROOT_DIR = path.resolve(CONTRACTS_DIR, "..");

export const LOCAL_RPC_URL = "http://127.0.0.1:8545";
export const DEV_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export const CURRENT_RPC_URL = process.env.RPC_URL || LOCAL_RPC_URL;
export const CURRENT_PRIVATE_KEY = process.env.PRIVATE_KEY || DEV_PRIVATE_KEY;

export function artifactPath(fileName, contractName) {
  return path.join(CONTRACTS_DIR, "out", `${fileName}.sol`, `${contractName}.json`);
}

export function loadArtifact(fileName, contractName) {
  return JSON.parse(readFileSync(artifactPath(fileName, contractName), "utf8"));
}

export function createClients() {
  const transport = http(CURRENT_RPC_URL);
  const publicClient = createPublicClient({ transport });
  const account = privateKeyToAccount(CURRENT_PRIVATE_KEY);
  const walletClient = createWalletClient({ account, transport });
  return { publicClient, walletClient, account };
}

export function loadDeployment() {
  const network = process.env.NETWORK || "localhost";
  const deploymentPath = path.join(ROOT_DIR, "deployments", `${network}.json`);
  return JSON.parse(readFileSync(deploymentPath, "utf8"));
}

export function writeDeployment(payload) {
  const deploymentDir = path.join(ROOT_DIR, "deployments");
  const webPublicDir = path.join(ROOT_DIR, "web", "public");
  mkdirSync(deploymentDir, { recursive: true });
  mkdirSync(webPublicDir, { recursive: true });

  const network = process.env.NETWORK || "localhost";
  const serialized = JSON.stringify(payload, null, 2);
  writeFileSync(path.join(deploymentDir, `${network}.json`), serialized);
  writeFileSync(path.join(webPublicDir, `${network}.json`), serialized);
}

export function guardContract(deployment, client) {
  return getContract({
    address: deployment.guard.address,
    abi: deployment.guard.abi,
    client
  });
}

export function inferenceContract(deployment, client) {
  return getContract({
    address: deployment.inference.address,
    abi: deployment.inference.abi,
    client
  });
}
