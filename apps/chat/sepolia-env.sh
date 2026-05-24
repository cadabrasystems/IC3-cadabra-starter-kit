#!/bin/bash
export NETWORK=sepolia

ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
fi

if [ -n "$ALCHEMY_API_KEY" ]; then
    export RPC_URL="https://eth-sepolia.g.alchemy.com/v2/$ALCHEMY_API_KEY"
else
    export RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
fi

if [ -z "$PRIVATE_KEY" ]; then
    echo "ERROR: PRIVATE_KEY is not set. Please copy the example file at $ROOT_DIR/.env-example to $ROOT_DIR/.env and set your PRIVATE_KEY inside."
    return 1 2>/dev/null || exit 1
fi

export PRIVATE_KEY=$PRIVATE_KEY
export VITE_NETWORK=sepolia
export INFERENCE_ADDRESS="0xbDAc1B0F60db1a3461F53A69332C4Cc06C724A0b"
