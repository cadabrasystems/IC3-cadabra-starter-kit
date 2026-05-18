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

## Prerequisites

Before getting started, make sure you have the following installed and set up:

### System Requirements
- **Node.js & npm**: Required to run the frontend, the orchestrator, and install dependencies.
- **[Foundry](https://getfoundry.sh/)**: Required to compile, test, and deploy the smart contracts (`forge`, `anvil`, `cast`).

### Web3 Requirements
- **MetaMask (or compatible Web3 Wallet)**: A browser extension to interact with the frontend.
- **Developer Private Key**: A wallet private key to deploy contracts and run the orchestrator.
- **Base Sepolia ETH**: Testnet tokens to pay for gas on the Base Sepolia network. (You can get these from a Base faucet or bridge from Sepolia).
- **RPC Provider URL (Optional but recommended)**: The starter kit provides the free public Base RPC (`https://sepolia.base.org`) by default. However, you can create a free Alchemy account to get a dedicated Base Sepolia RPC URL to avoid rate limits and speed up your app.

*Note: You **do not** need to deploy the AI Oracle yourself. The starter kit apps point to the globally deployed Cadabra `AbraInference` Oracle on Base Sepolia.*

## How to Run an Example

Let's use the `chat` app as an example.

### 1. Configure Your Wallet
1. Navigate to the app directory:
   ```bash
   cd apps/chat
   ```
2. Copy the `.env.example` file to a new file named `.env`:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and fill in your MetaMask private key. You can leave the default public Base Sepolia RPC URL as is, or uncomment and swap it for your own Alchemy URL for better performance.

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
