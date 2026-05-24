#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  if [[ -n "${WEB_PID:-}" ]]; then
    kill "$WEB_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -z "${INFERENCE_ADDRESS:-}" ]]; then
  echo "ERROR: INFERENCE_ADDRESS is not set. Please source an environment file first (e.g. source base-sepolia-env.sh)"
  exit 1
fi

npm --prefix "$ROOT_DIR/contracts" run deploy:network

# Start Web App
# No orchestrator needed — the frontend reads AI answers directly from the Oracle!
npm --prefix "$ROOT_DIR/web" run dev -- --host 0.0.0.0 --port 5173 &
WEB_PID=$!

echo "Guard Game running at http://localhost:5173"
echo "Press Ctrl+C to stop."
wait "$WEB_PID"
