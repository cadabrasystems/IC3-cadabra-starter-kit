#!/bin/bash
export NETWORK=fuji

ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
fi
# Also check parent repo .env (when used as a submodule)
PARENT_DIR=$(cd "$ROOT_DIR/.." && git rev-parse --show-toplevel 2>/dev/null || true)
if [ -n "$PARENT_DIR" ] && [ -f "$PARENT_DIR/.env" ]; then
    set -a
    source "$PARENT_DIR/.env"
    set +a
fi

export RPC_URL="https://api.avax-test.network/ext/bc/C/rpc"

export VITE_NETWORK=fuji
export INFERENCE_ADDRESS="0x339f01bed26baa5ff3482937bad11f11afbc502b"
