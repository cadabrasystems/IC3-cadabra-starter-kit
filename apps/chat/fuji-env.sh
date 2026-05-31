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

if [ -n "$ALCHEMY_API_KEY" ]; then
    export RPC_URL="https://avax-fuji.g.alchemy.com/v2/$ALCHEMY_API_KEY"
else
    export RPC_URL="https://api.avax-test.network/ext/bc/C/rpc"
fi

export VITE_NETWORK=fuji
export INFERENCE_ADDRESS="0xb7c2d85259d676b0dfbf932e992f8408f5b42b68"
