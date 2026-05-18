import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GUARD_DIR = path.resolve(__dirname, "../..");
const CONTRACTS_DIR = path.join(GUARD_DIR, "contracts");
const ORCHESTRATOR_DIR = path.join(GUARD_DIR, "orchestrator");
const DEPLOYMENT_PATH = path.join(GUARD_DIR, "deployments", "localhost.json");
const SHARED_MOCK_AGENT_PATH = path.resolve(
  GUARD_DIR,
  "../../packages/inference-core-agents/mock-agent.mjs"
);

export const RPC_URL = "http://127.0.0.1:8545";
export const ORCHESTRATOR_URL = "http://127.0.0.1:8787";
export const BROWSER_DEV_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
export const APPROVED_OUTPUT_CONTENT = "cadabra approved the candidate guard";
export const REJECTED_OUTPUT_CONTENT = "candidate guard rejected";

export function createQueryContent(guardPrompt, openingMessage, nextGuard) {
  void nextGuard;
  if (guardPrompt && openingMessage) {
    return `${guardPrompt} ${openingMessage}`;
  }
  return guardPrompt || openingMessage || "";
}

export async function createSuiteContext(onProcessLine) {
  const tempDir = mkdtempSync(path.join(ORCHESTRATOR_DIR, ".mock-agent-"));
  const rulesPath = path.join(tempDir, "rules.json");
  const processes = [];

  writeRulesFile(rulesPath, {});

  processes.push(
    spawnWithLogs("anvil", "npm", ["--prefix", CONTRACTS_DIR, "run", "node"], GUARD_DIR, {}, onProcessLine)
  );
  await waitForRpc(processes);

  await runCommand("npm", ["--prefix", CONTRACTS_DIR, "run", "deploy:localhost"], GUARD_DIR);

  processes.push(
    spawnWithLogs(
      "mock-agent",
      "node",
      [
        SHARED_MOCK_AGENT_PATH,
        "--deployment",
        "../deployments/localhost.json",
        "--rules",
        rulesPath
      ],
      CONTRACTS_DIR,
      {},
      onProcessLine
    )
  );

  processes.push(
    spawnWithLogs(
      "orchestrator",
      "npm",
      ["--prefix", ORCHESTRATOR_DIR, "run", "dev"],
      GUARD_DIR,
      {},
      onProcessLine
    )
  );
  await waitForOrchestrator(processes);

  const deployment = JSON.parse(readFileSync(DEPLOYMENT_PATH, "utf8"));
  const provider = new JsonRpcProvider(deployment.rpcUrl);
  const wallet = new Wallet(BROWSER_DEV_PRIVATE_KEY, provider);
  const guard = new Contract(deployment.guard.address, deployment.guard.abi, wallet);

  return {
    tempDir,
    rulesPath,
    processes,
    deployment,
    provider,
    wallet,
    guard
  };
}

export async function destroySuiteContext(context) {
  for (const handle of context.processes.slice().reverse()) {
    await stopProcess(handle.proc);
  }

  context.provider.destroy();
  rmSync(context.tempDir, { recursive: true, force: true });
}

export async function withFreshScenario(context, run) {
  const snapshotId = await context.provider.send("evm_snapshot", []);
  resetScenarioFiles(context);

  try {
    await run(context);
  } finally {
    await context.provider.send("evm_revert", [snapshotId]);
  }
}

export function resetScenarioFiles(context) {
  writeRulesFile(context.rulesPath, {});
}

export function writeRules(context, exactQueryContents, defaultOutputContent = null) {
  writeRulesFile(context.rulesPath, {
    exactQueryContents,
    ...(defaultOutputContent ? { defaultOutputContent } : {})
  });
}

export async function waitFor(check, timeoutMs, message, processes = []) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await check();
      if (result) {
        return result;
      }
    } catch {
      // Poll until ready.
    }

    await sleep(250);
  }

  const processDump = processes
    .map(({ name, logs }) => `[${name}]\n${logs.slice(-20).join("\n")}`)
    .join("\n\n");

  throw new Error(processDump ? `${message}\n\n${processDump}` : message);
}

export async function waitForRpc(processes) {
  await waitFor(async () => {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: []
      })
    });

    if (!response.ok) {
      return false;
    }

    const payload = await response.json();
    return payload.result === "0x7a69";
  }, 15000, "Anvil did not become ready.", processes);
}

export async function waitForOrchestrator(processes) {
  await waitFor(async () => {
    const response = await fetch(`${ORCHESTRATOR_URL}/health`);
    return response.ok;
  }, 15000, "Orchestrator did not become ready.", processes);
}

export async function runCommand(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        FORCE_COLOR: "0"
      }
    });

    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `${command} ${args.join(" ")} exited with code ${code}`));
    });

    proc.on("error", reject);
  });
}

export function spawnWithLogs(name, command, args, cwd, extraEnv = {}, onProcessLine) {
  const proc = spawn(command, args, {
    cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...extraEnv,
      FORCE_COLOR: "0"
    }
  });

  const logs = [];
  const push = (chunk) => {
    const lines = String(chunk)
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    for (const line of lines) {
      logs.push(line);
      if (logs.length > 200) {
        logs.shift();
      }
      onProcessLine?.(name, line);
    }
  };

  proc.stdout.on("data", push);
  proc.stderr.on("data", push);
  proc.on("error", (error) => {
    push(`[spawn-error] ${error.message}`);
  });

  return { name, proc, logs };
}

export async function stopProcess(proc) {
  if (!proc || proc.exitCode !== null) {
    return;
  }

  try {
    process.kill(-proc.pid, "SIGINT");
  } catch {
    proc.kill("SIGINT");
  }
  await Promise.race([once(proc, "exit"), sleep(1000)]);

  if (proc.exitCode === null) {
    try {
      process.kill(-proc.pid, "SIGKILL");
    } catch {
      proc.kill("SIGKILL");
    }
    await Promise.race([once(proc, "exit"), sleep(1000)]);
  }
}

function writeRulesFile(rulesPath, payload) {
  writeFileSync(rulesPath, JSON.stringify(payload, null, 2));
}
