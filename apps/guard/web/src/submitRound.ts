import { AbiCoder, Contract, BrowserProvider, JsonRpcProvider, Signer, keccak256, type InterfaceAbi } from "ethers";

type DeploymentConfig = {
  guard: {
    address: string;
    abi: InterfaceAbi;
  };
};

type SubmitRoundArgs = {
  deployment: DeploymentConfig;
  provider: BrowserProvider | JsonRpcProvider;
  signer: Signer;
  orchestratorUrl: string;
  openingMessage: string;
  nextGuard: string;
  randomNonce: string;
  setStatus: (status: string) => void;
  createContract?: (address: string, abi: InterfaceAbi, signer: Signer) => {
    placeCommitment: (
      commitment: string,
      options: { nonce: number }
    ) => Promise<{ wait: () => Promise<unknown> }>;
    revealMessage: (
      openingMessage: string,
      nextGuard: string,
      nonce: string,
      options: { nonce: number }
    ) => Promise<{ wait: () => Promise<unknown> }>;
  };
};

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function isNonceIssue(error: unknown): boolean {
  const message = formatError(error).toLowerCase();
  return (
    message.includes("nonce has already been used") ||
    message.includes("replacement transaction underpriced") ||
    message.includes("nonce too low")
  );
}

async function postMonitorEvent(
  orchestratorUrl: string,
  message: string,
  fields: Record<string, string> = {},
  level = "info"
): Promise<void> {
  try {
    await fetch(`${orchestratorUrl}/monitor/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source: "browser",
        level,
        message,
        fields
      })
    });
  } catch {
    // Monitoring is best-effort and must not block the workflow.
  }
}

export async function sendWithFreshNonce(
  provider: JsonRpcProvider,
  sender: string,
  send: (txNonce: number) => Promise<{ wait: () => Promise<unknown> }>
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    const txNonce = await provider.getTransactionCount(sender, "pending");

    try {
      const tx = await send(txNonce);
      await tx.wait();
      return;
    } catch (error) {
      if (!isNonceIssue(error)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to allocate transaction nonce.");
}

export async function submitGuardRound({
  deployment,
  provider,
  signer,
  orchestratorUrl,
  openingMessage,
  nextGuard,
  randomNonce,
  setStatus,
  createContract = (address, abi, contractSigner) => new Contract(address, abi, contractSigner)
}: SubmitRoundArgs): Promise<void> {
  const orchestratorHealth = await fetch(`${orchestratorUrl}/health`);
  if (!orchestratorHealth.ok) {
    throw new Error("Orchestrator is unavailable.");
  }

  const commitment = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["string", "string", "string"],
      [openingMessage, nextGuard, randomNonce]
    )
  );
  const contract = createContract(deployment.guard.address, deployment.guard.abi, signer);
  const sender = await signer.getAddress();

  setStatus("Step 1 of 2: Sign the hidden commitment in your wallet.");
  await postMonitorEvent(orchestratorUrl, "Browser is placing commitment", {
    openingMessage,
    nextGuard,
    nonce: randomNonce
  });
  await sendWithFreshNonce(provider, sender, (txNonce) =>
    contract.placeCommitment(commitment, { nonce: txNonce })
  );

  setStatus("Step 2 of 2: Sign the reveal in your wallet.");
  await postMonitorEvent(orchestratorUrl, "Browser is revealing message", {
    openingMessage,
    nextGuard
  });
  await sendWithFreshNonce(provider, sender, (txNonce) =>
    contract.revealMessage(openingMessage, nextGuard, randomNonce, { nonce: txNonce })
  );

  setStatus("Reveal accepted. Waiting for inference and the orchestrator to finish the round.");
  await postMonitorEvent(orchestratorUrl, "Browser finished commit and reveal", {
    openingMessage,
    nextGuard
  });
}
