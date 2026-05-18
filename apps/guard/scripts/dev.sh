#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  if [[ -n "${RELAY_PID:-}" ]]; then
    kill "$RELAY_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

if [[ -z "${INFERENCE_ADDRESS:-}" ]]; then
  echo "ERROR: INFERENCE_ADDRESS is not set. Please source an environment file first (e.g. source sepolia-env.sh)"
  exit 1
fi

npm --prefix "$ROOT_DIR/contracts" run deploy:network
npm --prefix "$ROOT_DIR/orchestrator" run dev >"$ROOT_DIR/.orchestrator.log" 2>&1 &
RELAY_PID=$!

RELAY_READY=false
for _ in {1..30}; do
  if curl -s http://127.0.0.1:8787/health >/dev/null; then
    RELAY_READY=true
    break
  fi
  sleep 1
done

if [[ "$RELAY_READY" != "true" ]]; then
  echo "Orchestrator server failed to start. See .orchestrator.log"
  exit 1
fi

npm --prefix "$ROOT_DIR/web" run dev -- --host 0.0.0.0 --port 5173
