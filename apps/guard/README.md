# Guard App

A local web3 guard game with commit-reveal input, shared `AbraInference` resolution, and orchestrator-driven settlement.

## Round workflow
Contract has global round states:
1. `Finished` (round closed, ready for next commitment)
2. `GotCommitment` (commitment placed)
3. `AwaitingInference` (message revealed, inference request opened)

Flow:
1. Browser computes `commitment = keccak256(message || nonce)`.
2. Browser submits commitment on-chain.
3. Browser reveals `(message, nonce)` on-chain.
4. Contract verifies reveal, hashes `(currentGuard, message)`, and requests inference from `AbraInference`.
5. A shared mock agent from `packages/inference-core-agents` proposes and resolves the inference result.
6. Orchestrator observes inference readiness and calls the guard contract to settle.
7. On win, the new guard becomes the revealed message.

## Current dev setup
- `web` writes commit + reveal using the connected browser wallet.
- `orchestrator` does not compute inference. It only settles the guard round after the global `AbraInference` oracle resolves it.

## Architecture
- `web` reads blockchain state directly and performs commit + reveal writes.
- `orchestrator` observes readiness and triggers settlement.
- `contracts` is a Foundry package that deploys `GuardGame` and hooks it to the global `AbraInference` contract.

## Project structure
- `contracts/`: Foundry project and app-local helper scripts.
- `orchestrator/`: Local HTTP orchestrator + observer loop.
- `web/`: Vite + React app.
- `scripts/dev.sh`: deploys the app, starts the orchestrator, and frontend.

## Quick start
1. Start the Oracle Network FIRST. In a separate terminal, navigate to `packages/oracle` and run `npm run dev`.
2. Start the Guard App. In this directory (`apps/guard`), run:
   ```bash
   npm run dev
   ```
3. Open:
   - `http://localhost:5173`

## Commands
- Contract tests + web tests:
  ```bash
  npm test
  ```
- Web build:
  ```bash
  npm run build:web
  ```
- Deploy to local node:
  ```bash
  npm --prefix contracts run deploy:localhost
  ```

## Orchestrator API
- `GET /health`

## Deployment metadata
Deploy writes to:
- `deployments/localhost.json`
- `web/public/localhost.json`

Both web and orchestrator use this metadata. It contains both the guard contract and `AbraInference` deployment info (fetched from the Oracle's deployment directory).

## Deploying to Sepolia Testnet

To test the Guard App on a public testnet like Sepolia (which supports EIP-4844 blobs), you need three things:

### Prerequisites

1. **Sepolia RPC URL**: You need an endpoint to communicate with the Sepolia blockchain.
2. **Private Key**: The private key of an Ethereum wallet used to deploy the Guard app.
3. **Sepolia ETH**: You need testnet ETH to pay for transaction gas.

### Deployment Steps

Ensure you have already deployed the Oracle and started its agent in `packages/oracle` before deploying the Guard App.

You must run these commands in separate terminal windows from the `apps/guard` directory.

**1. Deploy the Guard Contract**
Compile and deploy the `GuardGame` contract to Sepolia.
```bash
NETWORK=sepolia RPC_URL="https://your-sepolia-rpc-url" PRIVATE_KEY="0xYOUR_PRIVATE_KEY" npm --prefix contracts run deploy:network
```

**2. Start the Orchestrator**
The orchestrator monitors the Sepolia network and triggers contract settlements.
```bash
NETWORK=sepolia PRIVATE_KEY="0xYOUR_PRIVATE_KEY" npm --prefix orchestrator run dev
```

**3. Start the Web App**
Launch the frontend.
```bash
VITE_NETWORK=sepolia npm --prefix web run dev
```

Once running, open `http://localhost:5173` in your browser. Ensure your browser wallet (e.g., MetaMask) is connected to the **Sepolia Testnet** to play.
