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

if [ -z "$PRIVATE_KEY" ]; then
    echo "ERROR: PRIVATE_KEY is not set. Please copy the example file at $ROOT_DIR/.env-example to $ROOT_DIR/.env and set your PRIVATE_KEY inside."
    return 1 2>/dev/null || exit 1
fi

export PRIVATE_KEY=$PRIVATE_KEY
export VITE_NETWORK=base-sepolia
export INFERENCE_ADDRESS="0xb189678014ae6568319efe4dfd8df12857871444"
