import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, Contract } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HOST = "127.0.0.1";
const PORT = 8787;
const POLL_MS = 1500;
const PRIVATE_KEY = process.env.PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
let requestCounter = 0;
let inFlightSettle = false;
let settleCount = 0;
let lastSettle = null;
let lastError = "";
let lastKnownRoundState = null;
let lastKnownRequestId = null;
let lastKnownInferenceReady = null;
let lastKnownPendingOpeningMessage = null;
let lastKnownPendingNextGuard = null;
let lastKnownGuardPrompt = null;
let lastKnownLastAttemptRequestId = null;
let agentLogOffset = 0;
const timeline = [];
const MAX_TIMELINE_ENTRIES = 250;

const appRoot = path.resolve(__dirname, "../..");
const agentLogPath = process.env.GUARD_AGENT_LOG_PATH
  ? path.resolve(process.cwd(), process.env.GUARD_AGENT_LOG_PATH)
  : path.resolve(appRoot, ".mock-agent.log");

function pushTimeline(source, level, message, fields = {}) {
  timeline.push({
    ts: new Date().toISOString(),
    source,
    level: String(level).toLowerCase(),
    message,
    fields
  });

  if (timeline.length > MAX_TIMELINE_ENTRIES) {
    timeline.shift();
  }
}

function log(level, message, fields = {}, source = "orchestrator") {
  const ts = new Date().toISOString();
  const details = Object.entries(fields)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  const suffix = details.length > 0 ? ` ${details}` : "";
  console.log(`[${ts}] [${level}] ${message}${suffix}`);
  pushTimeline(source, level, message, fields);
}

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += String(chunk);
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function loadDeployment() {
  const network = process.env.NETWORK || "localhost";
  const deploymentPath = path.resolve(__dirname, `../../deployments/${network}.json`);
  return JSON.parse(readFileSync(deploymentPath, "utf8"));
}

function createQueryContent(guardPrompt, openingMessage) {
  if (guardPrompt && openingMessage) {
    return `${guardPrompt} ${openingMessage}`;
  }
  return guardPrompt || openingMessage || "";
}

function decodeLastAttempt(rawAttempt) {
  if (Array.isArray(rawAttempt)) {
    const hasRoundId = rawAttempt.length >= 7;
    return {
      roundId: String(hasRoundId ? rawAttempt[0] ?? "" : ""),
      previousGuard: String(rawAttempt[hasRoundId ? 1 : 0] ?? ""),
      openingMessage: String(rawAttempt[hasRoundId ? 2 : 1] ?? ""),
      nextGuard: String(rawAttempt[hasRoundId ? 3 : 2] ?? ""),
      output: String(rawAttempt[hasRoundId ? 4 : 3] ?? ""),
      won: Boolean(rawAttempt[hasRoundId ? 5 : 4]),
      requestId: String(rawAttempt[hasRoundId ? 6 : 5] ?? "")
    };
  }

  return {
    roundId: String(rawAttempt.roundId ?? ""),
    previousGuard: String(rawAttempt.previousGuard ?? ""),
    openingMessage: String(rawAttempt.openingMessage ?? ""),
    nextGuard: String(rawAttempt.nextGuard ?? ""),
    output: String(rawAttempt.output ?? ""),
    won: Boolean(rawAttempt.won),
    requestId: String(rawAttempt.requestId ?? "")
  };
}

const deployment = loadDeployment();
const provider = new JsonRpcProvider(deployment.rpcUrl);
const wallet = new Wallet(PRIVATE_KEY, provider);
const guard = new Contract(deployment.guard.address, deployment.guard.abi, wallet);
const inference = new Contract(deployment.inference.address, deployment.inference.abi, wallet);

function roundStateLabel(state) {
  return state === 0
    ? "Finished"
    : state === 1
      ? "Got commitment"
      : state === 2
        ? "Awaiting inference"
        : "Unknown";
}

function snapshotState() {
  return {
    orchestratorStatus: lastError ? "Degraded" : inFlightSettle ? "Settling" : "Healthy",
    settleCount,
    lastSettle,
    lastError,
    contract: deployment.guard.address,
    inference: deployment.inference.address,
    agentLogPath,
    roundState: lastKnownRoundState,
    roundStateLabel: lastKnownRoundState === null ? "Unknown" : roundStateLabel(lastKnownRoundState),
    pendingRequestId: lastKnownRequestId,
    inferenceReady: lastKnownInferenceReady,
    pendingOpeningMessage: lastKnownPendingOpeningMessage,
    pendingNextGuard: lastKnownPendingNextGuard,
    guardPrompt: lastKnownGuardPrompt
  };
}

function tailAgentLog() {
  try {
    const stats = statSync(agentLogPath);
    if (stats.size < agentLogOffset) {
      agentLogOffset = 0;
    }

    if (stats.size === agentLogOffset) {
      return;
    }

    const content = readFileSync(agentLogPath, "utf8");
    const nextChunk = content.slice(agentLogOffset);
    agentLogOffset = content.length;

    const lines = nextChunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      pushTimeline("agent", "info", line);
    }
  } catch {
    // Agent log may not exist yet in dev startup.
  }
}

async function observeChainProgress() {
  try {
    const state = Number(await guard.getRoundState());
    const guardPrompt = String(await guard.getGuardPrompt());
    const pendingOpeningMessage = String(await guard.getPendingOpeningMessage());
    const pendingNextGuard = String(await guard.getPendingNextGuard());
    const pendingQuery = state === 2 ? String(await guard.getPendingQuery()) : "";
    const requestIdValue = state === 2 ? await guard.getPendingRequestId() : null;
    const requestId = requestIdValue === null ? "" : String(requestIdValue);
    const inferenceReady = requestIdValue !== null ? Boolean(await inference.isReady(requestIdValue)) : false;
    const lastAttempt = decodeLastAttempt(await guard.getLastAttempt());
    const lastAttemptRequestId = lastAttempt.requestId;
    const lastAttemptOutput = lastAttempt.output;
    const lastAttemptWon = lastAttempt.won;

    if (lastKnownRoundState !== state) {
      pushTimeline("chain", "info", "Round state changed", {
        roundState: String(state),
        roundStateLabel: roundStateLabel(state)
      });
      lastKnownRoundState = state;
    }

    if (lastKnownGuardPrompt !== null && lastKnownGuardPrompt !== guardPrompt) {
      pushTimeline("chain", "info", "Guard prompt rotated", {
        guardPrompt
      });
    }
    lastKnownGuardPrompt = guardPrompt;

    if (lastKnownPendingOpeningMessage !== pendingOpeningMessage && pendingOpeningMessage) {
      pushTimeline("chain", "info", "Opening message updated", {
        openingMessage: pendingOpeningMessage
      });
    }
    lastKnownPendingOpeningMessage = pendingOpeningMessage;

    if (lastKnownPendingNextGuard !== pendingNextGuard && pendingNextGuard) {
      pushTimeline("chain", "info", "Replacement guard updated", {
        nextGuard: pendingNextGuard
      });
    }
    lastKnownPendingNextGuard = pendingNextGuard;

    if (state === 2 && lastKnownRequestId !== requestId) {
      pushTimeline("chain", "info", "Inference request opened", {
        requestId,
        queryContent: pendingQuery || createQueryContent(guardPrompt, pendingOpeningMessage)
      });
    }
    lastKnownRequestId = requestId;

    if (state === 2 && lastKnownInferenceReady !== inferenceReady) {
      pushTimeline("chain", "info", "Inference readiness changed", {
        requestId,
        inferenceReady: String(inferenceReady)
      });
    }
    lastKnownInferenceReady = inferenceReady;

    if (lastAttemptOutput && lastAttemptRequestId !== lastKnownLastAttemptRequestId) {
      pushTimeline("chain", "info", "Latest attempt updated", {
        requestId: lastAttemptRequestId,
        outputContent: lastAttemptOutput,
        won: String(lastAttemptWon)
      });
    }
    lastKnownLastAttemptRequestId = lastAttemptRequestId;
  } catch (error) {
    log("ERROR", "Chain observation failed", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

async function settleIfReady() {
  if (inFlightSettle) {
    return;
  }

  try {
    tailAgentLog();
    await observeChainProgress();

    const state = Number(await guard.getRoundState());
    if (state !== 2) {
      return;
    }

    const requestId = await guard.getPendingRequestId();
    const ready = await inference.isReady(requestId);
    if (!ready) {
      return;
    }

    const outputContent = String(await inference.getResult(requestId));

    inFlightSettle = true;
    const tx = await guard.settleRound();
    log("INFO", "Settlement tx sent", {
      txHash: tx.hash,
      requestId: requestId.toString(),
      outputContent
    });
    await tx.wait();
    const lastAttempt = decodeLastAttempt(await guard.getLastAttempt());
    log("INFO", "Settlement tx mined", {
      txHash: tx.hash,
      outputContent: lastAttempt.output
    });
    pushTimeline("chain", "info", "Latest attempt updated", {
      requestId: lastAttempt.requestId,
      outputContent: lastAttempt.output,
      won: String(lastAttempt.won)
    });
    settleCount += 1;
    lastSettle = {
      ts: new Date().toISOString(),
      txHash: tx.hash,
      requestId: requestId.toString(),
      won: lastAttempt.won
    };
    lastError = "";
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Unknown error";
    log("ERROR", "Settlement loop failed", {
      error: lastError
    });
  } finally {
    inFlightSettle = false;
  }
}

setInterval(() => {
  void settleIfReady();
}, POLL_MS);

const server = createServer(async (req, res) => {
  const reqId = ++requestCounter;

  if (req.method === "OPTIONS") {
    log("INFO", "CORS preflight", { reqId, path: req.url ?? "" });
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && req.url === "/health") {
    const state = Number(await guard.getRoundState());
    const requestId = await guard.getPendingRequestId();
    const inferenceReady = state === 2 ? await inference.isReady(requestId) : false;
    return json(res, 200, { ok: true, roundState: state, inferenceReady });
  }

  if (req.method === "GET" && req.url === "/monitor/state") {
    tailAgentLog();
    await observeChainProgress();
    return json(res, 200, {
      ok: true,
      summary: snapshotState(),
      timeline
    });
  }

  if (req.method === "POST" && req.url === "/monitor/events") {
    try {
      const payload = await readJsonBody(req);
      const source = typeof payload.source === "string" ? payload.source : "browser";
      const level = typeof payload.level === "string" ? payload.level : "info";
      const message = typeof payload.message === "string" ? payload.message : "";
      const fields = payload.fields && typeof payload.fields === "object" ? payload.fields : {};

      if (!message) {
        return json(res, 400, { ok: false, error: "Missing event message." });
      }

      pushTimeline(source, level, message, fields);
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Invalid request"
      });
    }
  }

  if (req.method === "GET" && req.url === "/monitor") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Guard Monitor</title>
  <style>
    :root {
      --bg: #f4f6f8;
      --panel: #ffffff;
      --border: #d8dee6;
      --text: #0f172a;
      --muted: #64748b;
      --test: #475569;
      --browser: #7c3aed;
      --chain: #0f766e;
      --orchestrator: #0369a1;
      --agent: #b45309;
      --pass: #166534;
      --fail: #b91c1c;
      --run: #92400e;
    }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, sans-serif; }
    .page { max-width: 1260px; margin: 0 auto; padding: 18px; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0 0 14px; color: var(--muted); }
    .grid { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; margin-bottom: 14px; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
    .k { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
    .v { font-weight: 600; white-space: pre-wrap; overflow-wrap: anywhere; }
    .pill { display:inline-block; padding:3px 8px; border-radius:999px; font-size:12px; font-weight:700; color:#fff; }
    .healthy { background: #166534; }
    .running { background: #92400e; }
    .degraded { background: #b91c1c; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .timeline { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px 14px; }
    .timeline-title { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 2px 0 10px; }
    .timeline-line { display: grid; grid-template-columns: auto auto 1fr; gap: 10px; align-items: start; padding: 8px 0; border-top: 1px solid #f1f5f9; }
    .timeline-line:first-child { border-top: 0; padding-top: 0; }
    .timeline-icon { width: 20px; text-align: center; }
    .timeline-src { width: 62px; font-size: 12px; font-weight: 700; }
    .timeline-text { line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
    .timeline-fields { margin-top: 4px; }
    .timeline-field { display:block; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
    .src-test { color: var(--test); }
    .src-browser { color: var(--browser); }
    .src-chain { color: var(--chain); }
    .src-orchestrator { color: var(--orchestrator); }
    .src-agent { color: var(--agent); }
    .empty { color: var(--muted); font-style: italic; }
    @media (max-width: 1000px) { .grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 760px) {
      .grid { grid-template-columns: 1fr; }
      .timeline-line { grid-template-columns: auto 1fr; }
      .timeline-src { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <h1>Guard Monitor</h1>
    <p id="meta">Loading...</p>
    <div id="summary" class="grid"></div>
    <section class="timeline">
      <div class="timeline-title">Live Timeline</div>
      <div id="timeline"></div>
    </section>
  </div>
  <script>
    function esc(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function sourceIcon(source) {
      if (source === 'agent') return '🤖';
      if (source === 'orchestrator') return '🛰️';
      if (source === 'chain') return '⛓️';
      if (source === 'browser') return '👤';
      return '🧪';
    }

    function sourceLabel(source) {
      if (source === 'orchestrator') return 'orchestrator';
      return source;
    }

    function statusClass(status) {
      if (status === 'Healthy') return 'healthy';
      if (status === 'Settling') return 'running';
      return 'degraded';
    }

    function highlightStrings(value) {
      return esc(value)
        .replace(/queryContent=([\\s\\S]*?)(?= outputContent=|$)/g, "queryContent=<strong>&#39;$1&#39;</strong>")
        .replace(/outputContent=([\\s\\S]*?)(?=$)/g, "outputContent=<strong>&#39;$1&#39;</strong>");
    }

    function renderFieldValue(key, value) {
      if (key === 'queryContent' || key === 'outputContent' || key === 'message' || key === 'guardPrompt') {
        return '<strong>&#39;' + esc(value) + '&#39;</strong>';
      }
      return esc(value);
    }

    function renderFields(fields) {
      if (!fields || Object.keys(fields).length === 0) return '';
      return '<div class="timeline-fields">' + Object.entries(fields).map(([key, value]) =>
        '<span class="timeline-field">' + esc(key) + ': ' + renderFieldValue(key, value) + '</span>'
      ).join('') + '</div>';
    }

    async function refresh() {
      const response = await fetch('/monitor/state');
      const payload = await response.json();
      const summary = payload.summary;
      document.getElementById('meta').textContent =
        'orchestrator=' + summary.orchestratorStatus + ' round=' + summary.roundStateLabel + ' request=' + (summary.pendingRequestId || '-');
      document.getElementById('summary').innerHTML = [
        ['Orchestrator Status', '<span class="pill ' + statusClass(summary.orchestratorStatus) + '">' + esc(summary.orchestratorStatus) + '</span>'],
        ['Round State', esc(summary.roundStateLabel + ' (' + String(summary.roundState ?? '-') + ')')],
        ['Pending Request', '<span class="mono">' + esc(summary.pendingRequestId || '-') + '</span>'],
        ['Inference Ready', esc(String(summary.inferenceReady))],
        ['Opening Message', summary.pendingOpeningMessage ? '<span class="mono">' + esc(summary.pendingOpeningMessage) + '</span>' : '-'],
        ['Replacement Guard', summary.pendingNextGuard ? '<span class="mono">' + esc(summary.pendingNextGuard) + '</span>' : '-'],
        ['Guard Prompt', summary.guardPrompt ? '<span class="mono">' + esc(summary.guardPrompt) + '</span>' : '-'],
        ['Settlements', esc(String(summary.settleCount))],
        ['Last Settle', summary.lastSettle ? '<span class="mono">' + esc(JSON.stringify(summary.lastSettle)) + '</span>' : '-'],
        ['Last Error', summary.lastError ? '<span class="mono">' + esc(summary.lastError) + '</span>' : '-'],
        ['Agent Log', '<span class="mono">' + esc(summary.agentLogPath) + '</span>'],
        ['Inference', '<span class="mono">' + esc(summary.inference) + '</span>']
      ].map(([key, value]) =>
        '<div class="card"><div class="k">' + key + '</div><div class="v">' + value + '</div></div>'
      ).join('');

      const lines = payload.timeline.map((entry) =>
        '<div class="timeline-line src-' + esc(entry.source) + '">' +
          '<div class="timeline-icon">' + sourceIcon(entry.source) + '</div>' +
          '<div class="timeline-src">' + esc(sourceLabel(entry.source)) + '</div>' +
          '<div>' +
            '<div class="timeline-text">' + highlightStrings(entry.message) + '</div>' +
            renderFields(entry.fields) +
          '</div>' +
        '</div>'
      ).join('');
      document.getElementById('timeline').innerHTML = lines || '<div class="empty">No events yet.</div>';
    }

    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>`);
    return;
  }

  log("WARN", "Route not found", { reqId, method: req.method ?? "", path: req.url ?? "" });
  return json(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, HOST, () => {
  log("INFO", "Orchestrator server running", { url: `http://${HOST}:${PORT}` });
  log("INFO", "Orchestrator observer started", { pollMs: POLL_MS, contract: deployment.guard.address });
});
