#!/bin/bash
export NETWORK=sepolia

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
    export RPC_URL="https://eth-sepolia.g.alchemy.com/v2/$ALCHEMY_API_KEY"
else
    export RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
fi

export VITE_NETWORK=sepolia
export INFERENCE_ADDRESS="0xbDAc1B0F60db1a3461F53A69332C4Cc06C724A0b"
