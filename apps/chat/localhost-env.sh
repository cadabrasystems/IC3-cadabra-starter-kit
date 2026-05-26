#!/bin/bash
export NETWORK=localhost

# Standard Anvil default RPC
export RPC_URL="http://127.0.0.1:8545"
export VITE_NETWORK=localhost

# Use Anvil default private key if not set
if [ -z "$PRIVATE_KEY" ]; then
    export PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
fi

# Find the inference address from the local deployment
ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
LOCAL_SETUP_JSON="$ROOT_DIR/local-setup/localhost.json"
if [ -f "$LOCAL_SETUP_JSON" ]; then
    export INFERENCE_ADDRESS=$(node -e "console.log(require('$LOCAL_SETUP_JSON').inference.address)")
else
    echo "Warning: $LOCAL_SETUP_JSON not found. Make sure you deploy the local inference contract first."
fi
