#!/bin/bash

# Load environment variables from .env if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$PRIVATE_KEY" ] || [ -z "$RPC_URL" ]; then
  echo "Error: PRIVATE_KEY and RPC_URL must be set."
  echo "Please copy .env.example to .env and fill in your details."
  return 1 2>/dev/null || exit 1
fi

export NETWORK=base-sepolia
export VITE_NETWORK=base-sepolia
export VITE_RPC_URL="$RPC_URL"
export INFERENCE_ADDRESS="0xb7c2d85259d676b0dfbf932e992f8408f5b42b68"
