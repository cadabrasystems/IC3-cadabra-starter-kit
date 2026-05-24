# Cadabra Hackathon Starter Kit

Welcome to the **Cadabra Hackathon Starter Kit**! The core goal of this hackathon is to empower you to build innovative Web3 applications that leverage an AI inference agent natively available directly on the blockchain. 

This repository is a lightweight, fully decoupled sandbox designed to help you quickly integrate your smart contracts with the global `AbraInference` Oracle.

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
- `web/`: A modern Vite + React frontend powered by `viem`.

## How to Run an Example

Let's use the `chat` app as an example.

### Prerequisites

Before starting, you must have **Foundry** installed to compile the smart contracts:
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 1. Configure Your Wallet
1. Copy the `.env-example` file to `.env` at the root of the project and add your own MetaMask `PRIVATE_KEY` (Make sure you have Base Sepolia ETH!).
   ```bash
   cp .env-example .env
   ```
2. Navigate to the app directory:
   ```bash
   cd apps/chat
   ```
3. The `INFERENCE_ADDRESS` is already hardcoded to the global `AbraInference` Oracle on Base Sepolia. Do not change this unless you deployed your own oracle.

### 2. Install Dependencies
Install all necessary packages across the contracts, orchestrator, and web frontend:
```bash
npm install
npm run install:all
```

### 3. Start the App
Load your wallet configuration and start the app:
```bash
source base-sepolia-env.sh
npm run dev
```

This single command will:
1. Compile and deploy your smart contract to Base Sepolia.
2. Start the Orchestrator loop in the background.
3. Start the React frontend on `http://localhost:5173`.

---

> **Tip:** We recommend using the **MetaMask** browser extension. Make sure to switch your network to **Base Sepolia** to interact with the frontend!

## Network & Faucets

To deploy contracts and interact with the applications, you will need **Base Sepolia ETH**. 

1. **Get Sepolia ETH**: First, claim free testnet ETH from the [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia).
2. **Bridge to Base Sepolia**: Once you have Sepolia ETH, bridge it over to the Base Sepolia network using the official [Base Bridge](https://bridge.base.org/deposit).

## MetaMask Configuration & Frontend

The frontend applications are perfectly designed for hackathon users and automatically handle network configuration. When a user connects their MetaMask wallet, the app uses `viem` and `wagmi` to check their current network. 

If they are not on Base Sepolia, the frontend will automatically prompt MetaMask to switch networks, or gracefully inject the Base Sepolia network configuration into their wallet if they don't already have it installed!

## Architecture: How Apps Access the AI

Both the Chat and Guard reference apps interact with the AI Oracle through a standard interface, making it incredibly easy to build your own dApps.

1. **The Oracle Interface**: Inside your app's contract folder, you will find `IDecentralizedAI.sol`. This abstract contract/interface defines the standard `requestInference(string query)` function.
2. **The App Contracts**: Contracts like `PublicChat.sol` and `GuardGame.sol` import this interface and initialize a pointer to the global `AbraInference` Oracle during deployment.
3. **Triggering the AI**: When a user submits a message, the app contract simply calls `inference.requestInference(query)`. This emits an event on the blockchain, which the central AI Agent instantly detects, processes via OpenAI, and resolves the answer back on-chain!

## Troubleshooting

### MetaMask "Still connecting to Base Sepolia Testnet" / "Update RPC" Error
If MetaMask is stuck loading or fails to connect to the Base Sepolia network, it means the default public RPC (`https://sepolia.base.org`) is congested or down. To fix this, click "Update RPC" in MetaMask (or go to Settings -> Networks -> Base Sepolia) and change the **New RPC URL** to one of these reliable public backups:
- `https://base-sepolia-rpc.publicnode.com`
- `https://base-sepolia.blockpi.network/v1/rpc/public`
