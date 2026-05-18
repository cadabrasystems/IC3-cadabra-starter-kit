#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  if [[ -n "${ORCHESTRATOR_PID:-}" ]]; then
    kill "$ORCHESTRATOR_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${WEB_PID:-}" ]]; then
    kill "$WEB_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -z "${INFERENCE_ADDRESS:-}" ]]; then
  echo "ERROR: INFERENCE_ADDRESS is not set. Please source an environment file first (e.g. source sepolia-env.sh)"
  exit 1
fi

npm --prefix "$ROOT_DIR/contracts" run deploy:network

# Start Orchestrator
npm --prefix "$ROOT_DIR/orchestrator" run dev >"$ROOT_DIR/.orchestrator.log" 2>&1 &
ORCHESTRATOR_PID=$!

# Start Web App
npm --prefix "$ROOT_DIR/web" run dev &
WEB_PID=$!

echo "Chat App Infrastructure running."
echo "Press Ctrl+C to stop."
wait -n "$ORCHESTRATOR_PID" "$WEB_PID"
