# Cadabra Hackathon Starter Kit

Welcome to the **Cadabra Hackathon Starter Kit**! This repository is a lightweight, fully decoupled sandbox designed for building Web3 AI applications on top of the `AbraInference` Oracle.

This template contains two working reference implementations to help you get started immediately:

## Included Reference Apps

1. **[Public Chat App (`apps/chat`)](./apps/chat)**
   A classic multi-user interface where messages are stored on-chain and answered by the decentralized AI agent.
2. **[Guard Game (`apps/guard`)](./apps/guard)**
   A commit-reveal game where users attempt to jailbreak a system prompt guarded by the AI agent.

## Folder Structure

Each app in the `apps/` directory is an independent, full-stack Web3 application containing:
- `contracts/`: A Foundry project containing the Smart Contracts.
- `orchestrator/`: A Node.js background worker that polls the Oracle and settles answers.
- `web/`: A modern Vite + React frontend powered by `ethers.js`.

## How to Run an Example

Let's use the `chat` app as an example.

### 1. Configure Your Wallet
1. Navigate to the app directory:
   ```bash
   cd apps/chat
   ```
2. Open `sepolia-env.sh` and replace the `PRIVATE_KEY` with your own MetaMask private key (Make sure you have Sepolia ETH!).
3. The `INFERENCE_ADDRESS` is already hardcoded to the global `AbraInference` Oracle on Sepolia. Do not change this unless you deployed your own oracle.

### 2. Install Dependencies
Install all necessary packages across the contracts, orchestrator, and web frontend:
```bash
npm install
npm run install:all
```

### 3. Start the App
Load your wallet configuration and start the app:
```bash
source sepolia-env.sh
npm run dev
```

This single command will:
1. Compile and deploy your smart contract to Sepolia.
2. Start the Orchestrator loop in the background.
3. Start the React frontend on `http://localhost:5173`.

---

> **Tip:** We recommend using the **MetaMask** browser extension. Make sure to switch your network to **Sepolia** (or **Base Sepolia**) to interact with the frontend!

## Troubleshooting

### MetaMask "Still connecting to Base Sepolia Testnet" / "Update RPC" Error
If MetaMask is stuck loading or fails to connect to the Base Sepolia network, it means the default public RPC (`https://sepolia.base.org`) is congested or down. To fix this, click "Update RPC" in MetaMask (or go to Settings -> Networks -> Base Sepolia) and change the **New RPC URL** to one of these reliable public backups:
- `https://base-sepolia-rpc.publicnode.com`
- `https://base-sepolia.blockpi.network/v1/rpc/public`
