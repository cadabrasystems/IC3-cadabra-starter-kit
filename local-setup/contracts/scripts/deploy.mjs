import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard Anvil default RPC and private key (Account #0)
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

  const artifactPath = path.join(__dirname, "../out/CadabraInference.sol/CadabraInference.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

  console.log(`Deploying CadabraInference to ${RPC_URL} using account ${account.address}...`);

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    account
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const address = receipt.contractAddress;

  console.log(`Deployed CadabraInference to: ${address}`);

  const chainId = await publicClient.getChainId();

  const deployment = {
    chainId,
    rpcUrl: RPC_URL,
    inference: {
      address,
      abi: artifact.abi
    }
  };

  const deploymentPath = path.join(__dirname, "../../localhost.json");
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
  console.log(`Deployment configuration saved to: local-setup/localhost.json`);
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
