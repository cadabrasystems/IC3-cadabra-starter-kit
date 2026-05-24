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

Both the Chat and Guard reference apps interact with the AI Oracle through a standard Solidity interface, making it incredibly easy to build your own dApps on top of the same infrastructure.

### The `IDecentralizedAI` Interface

Inside each app's `contracts/src/interfaces/` folder, you will find [`IDecentralizedAI.sol`](./apps/chat/contracts/src/interfaces/IDecentralizedAI.sol). This is the universal interface your smart contract uses to talk to the AI Oracle. It exposes four functions:

| Function | Description |
|---|---|
| `requestInference(string query)` → `uint256 requestId` | Sends a natural-language query to the AI. Returns a unique `requestId` you use to track and retrieve the result. |
| `isReady(uint256 requestId)` → `bool` | Returns `true` once the AI Agent has proposed and finalized the answer for a given request. |
| `getResult(uint256 requestId)` → `string output` | Retrieves the finalized AI-generated answer as a plain string. |
| `getRequest(uint256 requestId)` → `(RequestState, query, output, proposer, timestamp)` | Returns the full details of a request, including its current lifecycle state. |

Every request goes through a lifecycle tracked by the `RequestState` enum:
- **`Unproposed`** — The query has been submitted but no AI Agent has responded yet.
- **`Proposed`** — An Agent has submitted a candidate answer and staked a bond.
- **`InDispute`** — Another participant has challenged the proposed answer.
- **`Finalized`** — The answer is accepted and immutable. `getResult()` will return the final output.

### How Your App Contract Uses It

Here is the pattern used by both `PublicChat.sol` and `GuardGame.sol`:

```solidity
import "./interfaces/IDecentralizedAI.sol";

contract MyApp {
    IDecentralizedAI public immutable inferenceService;

    constructor(address inference) {
        inferenceService = IDecentralizedAI(inference);
    }

    function askAI(string memory question) external {
        // 1. Send the query — returns a unique requestId
        uint256 requestId = inferenceService.requestInference(question);

        // 2. Store the requestId so you can settle later
        // ...
    }

    function settleAnswer(uint256 requestId) external {
        // 3. Check if the answer is ready
        require(inferenceService.isReady(requestId), "Not ready yet");

        // 4. Retrieve the AI's answer
        string memory answer = inferenceService.getResult(requestId);

        // 5. Use it however you want!
        // ...
    }
}
```

### The Full Request Flow

```
User (MetaMask) → Your App Contract → inferenceService.requestInference(query)
                                              ↓
                              Event emitted on-chain
                                              ↓
                              AI Agent detects event, calls OpenAI
                                              ↓
                              Agent calls proposeResult() + resolve()
                                              ↓
                              Orchestrator polls isReady(), calls settleMessage()
                                              ↓
                              Frontend reads the settled answer from the chain
```

## Deploying to the Cloud

While `npm run dev` is perfect for local development, you can also split the app into its components and deploy them independently for a production-ready setup.

### Frontend → Vercel (or any static host)

The `web/` folder is a standard Vite + React app that can be deployed to Vercel, Netlify, or any static hosting provider.

**Vercel Deployment Steps:**
1. Push your code to GitHub (make sure `web/public/base-sepolia.json` is committed — it contains your deployed contract address and ABI).
2. Go to [vercel.com](https://vercel.com), click **Add New Project**, and import your repository.
3. Set the **Root Directory** to `hackathon-starter-kit/apps/chat/web` (or `apps/guard/web`).
4. Add the following **Environment Variable** (under Settings → Environment Variables):
   - **Key:** `VITE_NETWORK`  **Value:** `base-sepolia`
   - ⚠️ Make sure to enable it for **Production** (not just Development!).
5. Click **Deploy**.

> **Important:** Every time you redeploy a new smart contract (which generates a new `base-sepolia.json`), you must commit the updated JSON file, push to GitHub, and **Redeploy** on Vercel (without build cache) so the frontend picks up the new contract address.

### Orchestrator → Cloud Server (VPS + PM2)

The Orchestrator is a lightweight Node.js polling loop that watches the blockchain for pending AI answers and settles them into your app contract. It runs perfectly on a small cloud server (e.g., a $4/month DigitalOcean Droplet).

**Steps:**
1. SSH into your server and clone the repository.
2. Install dependencies:
   ```bash
   cd apps/chat
   npm install && npm run install:all
   ```
3. Source your environment and start with PM2:
   ```bash
   source base-sepolia-env.sh
   pm2 start orchestrator/src/server.mjs --name "chat-orchestrator"
   ```
4. View logs anytime: `pm2 logs chat-orchestrator`

> **Tip:** The Orchestrator and the Vercel frontend **must** point to the same contract address. Both read from the same `base-sepolia.json` file, so always `git pull` on your server after redeploying a contract and run `pm2 restart chat-orchestrator`.

## Troubleshooting

### MetaMask "Still connecting to Base Sepolia Testnet" / "Update RPC" Error
If MetaMask is stuck loading or fails to connect to the Base Sepolia network, it means the default public RPC (`https://sepolia.base.org`) is congested or down. To fix this, click "Update RPC" in MetaMask (or go to Settings -> Networks -> Base Sepolia) and change the **New RPC URL** to one of these reliable public backups:
- `https://base-sepolia-rpc.publicnode.com`
- `https://base-sepolia.blockpi.network/v1/rpc/public`

### Vercel: Page loads but app is stuck / "localhost.json 404"
This means the `VITE_NETWORK` environment variable is missing or not set for the **Production** environment. Go to Vercel Settings → Environment Variables, set `VITE_NETWORK=base-sepolia` with the **Production** checkbox enabled, and **Redeploy without build cache**.

### Orchestrator settles but frontend doesn't update
Make sure both the Orchestrator and the frontend's `web/public/base-sepolia.json` file contain the **same contract address**. If you redeployed the contract, update both sides.
