#!/bin/bash
export NETWORK=base-sepolia

ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
fi

if [ -n "$ALCHEMY_API_KEY" ]; then
    export RPC_URL="https://base-sepolia.g.alchemy.com/v2/$ALCHEMY_API_KEY"
else
    export RPC_URL="https://base-sepolia-rpc.publicnode.com"
fi

export VITE_NETWORK=base-sepolia
export INFERENCE_ADDRESS="0xb189678014ae6568319efe4dfd8df12857871444"
