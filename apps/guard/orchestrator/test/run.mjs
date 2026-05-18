import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { createSuiteContext, destroySuiteContext, withFreshScenario } from "./support.mjs";
import { scenarios } from "./scenarios.mjs";

const uiMode = process.argv.includes("--ui");
const OUTPUT_DIR = path.resolve(import.meta.dirname, "..", "test-output", "latest");

rmSync(OUTPUT_DIR, { recursive: true, force: true });
mkdirSync(OUTPUT_DIR, { recursive: true });

const state = {
  startedAt: new Date().toISOString(),
  running: false,
  completed: false,
  scenarios: scenarios.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    details: scenario.details,
    status: "pending",
    durationMs: 0,
    progress: [],
    error: ""
  }))
};

let server = null;
let suiteContext = null;
let activeScenarioId = null;
let failed = false;
let shuttingDown = false;

function persistState() {
  writeFileSync(path.join(OUTPUT_DIR, "state.json"), JSON.stringify(state, null, 2));
}

function appendScenarioLine(scenarioId, line) {
  appendFileSync(path.join(OUTPUT_DIR, `${scenarioId}.log`), `${line}\n`);
}

function formatProgress(entry) {
  const fields = entry.fields && Object.keys(entry.fields).length > 0 ? ` ${JSON.stringify(entry.fields)}` : "";
  return `[${entry.ts}] [${entry.source}] [${entry.level}] ${entry.message}${fields}`;
}

function recordProgress(record, details) {
  const entry = {
    ts: new Date().toISOString(),
    source: details.source,
    level: details.level ?? "info",
    message: details.message,
    fields: details.fields ?? {}
  };
  record.progress.push(entry);
  appendScenarioLine(record.id, formatProgress(entry));
  persistState();
}

function processSource(name) {
  if (name === "mock-agent") {
    return "agent";
  }
  if (name === "orchestrator") {
    return "orchestrator";
  }
  if (name === "anvil") {
    return "chain";
  }
  return "test";
}

function handleProcessLine(name, line) {
  if (!activeScenarioId || name === "anvil") {
    return;
  }

  const record = state.scenarios.find((item) => item.id === activeScenarioId);
  if (!record) {
    return;
  }

  recordProgress(record, {
    source: processSource(name),
    level: "info",
    message: line
  });
}

persistState();

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderUi() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Guard E2E Tests</title>
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
    h1 { margin: 0 0 8px; font-size: 18px; }
    p { margin: 0 0 14px; color: var(--muted); }
    .scenario-list { display: grid; gap: 14px; }
    .scenario { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .scenario-head { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: start; padding: 12px 14px; border-bottom: 1px solid #e5e7eb; background: #f8fafc; }
    .scenario-name { font-size: 15px; font-weight: 700; line-height: 1.35; margin-bottom: 6px; }
    .scenario-details { color: var(--muted); line-height: 1.5; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .badge-pass { color: #14532d; background: #dcfce7; }
    .badge-fail { color: #7f1d1d; background: #fee2e2; }
    .badge-run { color: #78350f; background: #fef3c7; }
    .badge-pending { color: #374151; background: #e5e7eb; }
    .duration { color: var(--muted); font-size: 12px; text-align: right; }
    .timeline { padding: 10px 14px 14px; }
    .timeline-title, .outcome-title { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 2px 0 10px; }
    .timeline-line { display: grid; grid-template-columns: auto auto 1fr; gap: 10px; align-items: start; padding: 8px 0; border-top: 1px solid #f1f5f9; }
    .timeline-line:first-child { border-top: 0; padding-top: 0; }
    .timeline-icon { width: 20px; text-align: center; }
    .timeline-src { width: 62px; font-size: 12px; font-weight: 700; }
    .timeline-text { line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
    .timeline-fields { margin-top: 4px; }
    .timeline-field { display: block; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
    .src-test { color: var(--test); }
    .src-browser { color: var(--browser); }
    .src-chain { color: var(--chain); }
    .src-orchestrator { color: var(--orchestrator); }
    .src-agent { color: var(--agent); }
    .outcome { padding: 10px 14px 14px; border-top: 1px solid #e5e7eb; background: #fafafa; }
    .outcome-pass { color: var(--pass); font-weight: 700; }
    .outcome-fail { color: var(--fail); font-weight: 700; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .empty { color: var(--muted); font-style: italic; }
    @media (max-width: 900px) {
      .scenario-head { grid-template-columns: 1fr; }
      .duration { text-align: left; }
      .timeline-line { grid-template-columns: auto 1fr; }
      .timeline-src { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <h1>Guard End-to-End Tests</h1>
    <p id="meta">Loading...</p>
    <div id="rows" class="scenario-list"></div>
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

    function badgeClass(status) {
      if (status === 'passed') return 'badge badge-pass';
      if (status === 'failed') return 'badge badge-fail';
      if (status === 'running') return 'badge badge-run';
      return 'badge badge-pending';
    }

    function sourceIcon(source) {
      if (source === 'agent') return '🤖';
      if (source === 'orchestrator') return '🛰️';
      if (source === 'chain') return '⛓️';
      if (source === 'browser') return '👤';
      return '🧪';
    }

    function highlightStrings(value) {
      return esc(value)
        .replace(/&#39;([^']+)&#39;/g, '<strong>&#39;$1&#39;</strong>')
        .replace(/queryContent=([\s\S]*?)(?= outputContent=|$)/g, "queryContent=<strong>&#39;$1&#39;</strong>")
        .replace(/outputContent=([\s\S]*?)(?=$)/g, "outputContent=<strong>&#39;$1&#39;</strong>");
    }

    function renderFieldValue(key, value) {
      if (key === 'queryContent' || key === 'outputContent' || key === 'message') {
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
      const response = await fetch('/state');
      const state = await response.json();
      document.getElementById('meta').textContent =
        'running=' + String(state.running) + ' completed=' + String(state.completed) + ' startedAt=' + state.startedAt;
      document.getElementById('rows').innerHTML = state.scenarios.map((scenario) => {
        const progress = (scenario.progress || []).map((entry) => {
          const lineCls = 'src-' + entry.source;
          return '<div class="timeline-line ' + lineCls + '">' +
            '<div class="timeline-icon">' + sourceIcon(entry.source) + '</div>' +
            '<div class="timeline-src">' + esc(entry.source === 'orchestrator' ? 'orchestrator' : entry.source) + '</div>' +
            '<div>' +
              '<div class="timeline-text">' + highlightStrings(entry.message) + '</div>' +
              renderFields(entry.fields) +
            '</div>' +
          '</div>';
        }).join('');
        const outcome = scenario.error
          ? '<span class="outcome-fail">failure</span><pre class="mono">' + esc(scenario.error) + '</pre>'
          : scenario.status === 'passed'
            ? '<span class="outcome-pass">success</span>'
            : '<span class="empty">pending</span>';
        return '<section class="scenario">' +
          '<div class="scenario-head">' +
            '<div>' +
              '<div class="scenario-name">' + esc(scenario.name) + '</div>' +
              '<div class="scenario-details">' + esc(scenario.details) + '</div>' +
            '</div>' +
            '<div><span class="' + badgeClass(scenario.status) + '">' + esc(scenario.status) + '</span></div>' +
            '<div class="duration">' + String(scenario.durationMs || 0) + ' ms</div>' +
          '</div>' +
          '<div class="timeline">' +
            '<div class="timeline-title">Scenario Timeline</div>' +
            (progress || '<div class="empty">No progress yet.</div>') +
          '</div>' +
          '<div class="outcome">' +
            '<div class="outcome-title">Outcome</div>' +
            '<div>' + outcome + '</div>' +
          '</div>' +
        '</section>';
      }).join('');
    }

    refresh();
    setInterval(refresh, 500);
  </script>
</body>
</html>`;
}

async function startServer() {
  server = createServer((req, res) => {
    if (req.url === "/state") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(state));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderUi());
  });

  await new Promise((resolve) => server.listen(8791, "127.0.0.1", resolve));
  console.log("Guard test UI: http://127.0.0.1:8791");
}

async function closeServer() {
  if (!server) {
    return;
  }

  const activeServer = server;
  server = null;
  await new Promise((resolve) => activeServer.close(() => resolve()));
}

async function cleanup({ closeUi } = { closeUi: true }) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  state.running = false;
  persistState();

  if (suiteContext) {
    await destroySuiteContext(suiteContext);
    suiteContext = null;
  }

  if (closeUi) {
    await closeServer();
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void cleanup({ closeUi: true }).finally(() => {
      process.exit(130);
    });
  });
}

process.on("uncaughtException", (error) => {
  console.error(error);
  void cleanup({ closeUi: true }).finally(() => {
    process.exit(1);
  });
});

process.on("unhandledRejection", (error) => {
  console.error(error);
  void cleanup({ closeUi: true }).finally(() => {
    process.exit(1);
  });
});

if (uiMode) {
  await startServer();
}

try {
  suiteContext = await createSuiteContext(handleProcessLine);
  state.running = true;
  persistState();

  for (const scenario of scenarios) {
    const record = state.scenarios.find((item) => item.id === scenario.id);
    record.status = "running";
    record.error = "";
    record.progress = [];
    record.durationMs = 0;
    persistState();

    const startedAt = Date.now();
    activeScenarioId = scenario.id;

    try {
      await withFreshScenario(suiteContext, async (context) => {
        await scenario.run(context, (details) => {
          if (details.kind === "progress") {
            recordProgress(record, details);
          }
        });
      });
      record.status = "passed";
      appendScenarioLine(record.id, `[${new Date().toISOString()}] [result] [pass] success`);
    } catch (error) {
      failed = true;
      record.status = "failed";
      record.error = error instanceof Error ? error.stack ?? error.message : String(error);
      appendScenarioLine(record.id, `[${new Date().toISOString()}] [result] [fail] ${record.error}`);
    } finally {
      activeScenarioId = null;
      record.durationMs = Date.now() - startedAt;
      persistState();
    }
  }

  state.running = false;
  state.completed = true;
  persistState();

  if (uiMode) {
    await cleanup({ closeUi: false });
    console.log("Tests complete. Press Ctrl+C to stop the UI.");
  } else {
    await cleanup({ closeUi: true });
  }
} catch (error) {
  failed = true;
  throw error;
}

if (!uiMode) {
  process.exitCode = failed ? 1 : 0;
} else if (failed) {
  process.exitCode = 1;
}
