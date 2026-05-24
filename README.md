# Cadabra Hackathon Starter Kit

Welcome to the **Cadabra Hackathon Starter Kit**! The core goal of this hackathon is to empower you to build innovative Web3 applications that leverage an AI inference agent natively available directly on the blockchain. 

Your smart contracts can ask an AI a question and receive an answer — all fully on-chain, trustlessly, and without any centralized API keys. This repository is a lightweight, fully decoupled sandbox designed to help you quickly integrate your smart contracts with the global `AbraInference` Oracle.

## Quick Start — What You Need to Know

### The Network: Base Sepolia

All development happens on **Base Sepolia**, a free testnet for the Base L2 blockchain. You will deploy contracts, send transactions, and interact with the AI Oracle entirely on this network. It costs nothing — all ETH used is free testnet ETH.

| Detail | Value |
|---|---|
| **Network Name** | Base Sepolia |
| **Chain ID** | `84532` |
| **Currency** | ETH (testnet) |
| **Block Explorer** | [sepolia.basescan.org](https://sepolia.basescan.org) |
| **Public RPC** | `https://base-sepolia-rpc.publicnode.com` |

### Step 1: Set Up MetaMask

1. Install the [MetaMask browser extension](https://metamask.io/download/) if you don't have it.
2. **You do NOT need to manually add the Base Sepolia network.** When you open any of our frontend apps and connect your wallet, the app will automatically detect your network and prompt MetaMask to switch to Base Sepolia (or add it for you if it's missing).
3. If you prefer to add it manually: Open MetaMask → Settings → Networks → Add Network, and enter the details from the table above.

### Step 2: Get Free Testnet ETH

You need testnet ETH to deploy contracts and send transactions. Here's how:

1. **Get Sepolia ETH**: Claim free ETH from the [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia). Paste your MetaMask wallet address and claim.
2. **Bridge to Base Sepolia**: Go to the [Base Bridge](https://superbridge.app/base-sepolia), connect your wallet, switch to the Sepolia testnet, and bridge your Sepolia ETH over to Base Sepolia. This takes about 1 minute.

> **Tip:** You only need a small amount of ETH (0.01 - 0.05 is plenty) to deploy contracts and send messages during the hackathon.

### Step 3: Export Your Private Key

The deployment scripts need your wallet's private key to sign transactions from the command line.

1. Open MetaMask → Click the three dots (⋮) on your account → **Account Details** → **Show Private Key**.
2. Copy it. You'll paste it into a `.env` file in the next step.

> ⚠️ **Security Note:** Never use your real mainnet wallet for hackathon development. Create a fresh MetaMask account specifically for this event. It only holds free testnet ETH, so there is zero risk.

---

## Included Reference Apps

This template contains two working reference implementations to help you get started immediately:

1. **[Public Chat App (`apps/chat`)](./apps/chat)**
   A classic multi-user interface where messages are stored on-chain and answered by the decentralized AI agent.
2. **[Guard Game (`apps/guard`)](./apps/guard)**
   A commit-reveal game where users attempt to jailbreak a system prompt guarded by the AI agent.

## Folder Structure

Each app in the `apps/` directory is an independent, full-stack Web3 application containing:
- `contracts/`: A Foundry project containing the Smart Contracts.
- `web/`: A modern Vite + React frontend powered by `viem`.

> **No backend server or orchestrator is needed!** The frontend reads AI answers directly from the Oracle using free `view` calls. You just deploy a contract and host a static website.

## How to Run an Example

Let's use the `chat` app as an example.

### Prerequisites

Before starting, make sure you have:
- **Node.js v22+** — [Download here](https://nodejs.org/)
- **Foundry** (for compiling and deploying Solidity contracts):
  ```bash
  curl -L https://foundry.paradigm.xyz | bash
  foundryup
  ```

### 1. Configure Your Wallet
1. Copy the `.env-example` file to `.env` at the root of the project and paste in your MetaMask private key:
   ```bash
   cp .env-example .env
   ```
   Then edit `.env` and set your `PRIVATE_KEY`.
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
2. Start the React frontend on `http://localhost:5173`.

Open `http://localhost:5173` in your browser, connect MetaMask, and start chatting with the AI!

## Architecture: How Apps Access the AI

Both the Chat and Guard reference apps interact with the AI Oracle through a standard Solidity interface, making it incredibly easy to build your own dApps on top of the same infrastructure.

The core idea is simple: your smart contract sends a **plain-text prompt** (any string — a question, instruction, or conversation history) to the Oracle, and receives back a **plain-text answer** from an AI agent. The prompt is just text; there is no special format required. You request an inference, then later check its state — once finalized, the result (the AI's response) is available to read on-chain.

### The `IDecentralizedAI` Interface

We provide a copy of the interface at the root of this repository for easy reference: [`interfaces/IDecentralizedAI.sol`](./interfaces/IDecentralizedAI.sol). This is the universal interface your smart contract imports to talk to the AI Oracle. It is fully documented with NatSpec comments and a usage example. It exposes four functions:

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
                              Frontend polls isReady() + getResult() (free view calls)
                                              ↓
                              Answer displayed — no backend needed!
```

> **Note:** No orchestrator or backend server is required. The frontend polls the Oracle directly using `isReady()` and `getResult()`, which are free read-only calls that cost zero gas.

## Deploying to the Cloud

Since the frontend reads AI answers directly from the Oracle (no backend needed!), deploying is as simple as hosting a static website.

### Frontend → Vercel (or any static host)

The `web/` folder is a standard Vite + React app that can be deployed to Vercel, Netlify, GitHub Pages, or any static hosting provider.

**Vercel Deployment Steps:**
1. Push your code to GitHub (make sure `web/public/base-sepolia.json` is committed — it contains your deployed contract address and ABI).
2. Go to [vercel.com](https://vercel.com), click **Add New Project**, and import your repository.
3. Set the **Root Directory** to your app's `web` folder (e.g. `hackathon-starter-kit/apps/chat/web`).
4. Add the following **Environment Variable** (under Settings → Environment Variables):
   - **Key:** `VITE_NETWORK`  **Value:** `base-sepolia`
   - ⚠️ Make sure to enable it for **Production** (not just Development!).
5. Click **Deploy**.

> **Important:** Every time you redeploy a new smart contract (which generates a new `base-sepolia.json`), you must commit the updated JSON file, push to GitHub, and **Redeploy** on Vercel (without build cache) so the frontend picks up the new contract address.

## Troubleshooting

### MetaMask "Still connecting to Base Sepolia Testnet" / "Update RPC" Error
If MetaMask is stuck loading or fails to connect to the Base Sepolia network, it means the default public RPC (`https://sepolia.base.org`) is congested or down. To fix this, click "Update RPC" in MetaMask (or go to Settings -> Networks -> Base Sepolia) and change the **New RPC URL** to one of these reliable public backups:
- `https://base-sepolia-rpc.publicnode.com`
- `https://base-sepolia.blockpi.network/v1/rpc/public`

### Vercel: Page loads but app is stuck / "localhost.json 404"
This means the `VITE_NETWORK` environment variable is missing or not set for the **Production** environment. Go to Vercel Settings → Environment Variables, set `VITE_NETWORK=base-sepolia` with the **Production** checkbox enabled, and **Redeploy without build cache**.

## Live Demo

Check out a live, working deployment of the Chat App to see exactly what you'll be building:

🔗 **[Live Chat App Demo](https://ic-3-cadabra-starter-kit-copy-ejwp.vercel.app/)**

Connect your MetaMask wallet (on the Base Sepolia network), send a message, and watch the decentralized AI respond in real-time!
