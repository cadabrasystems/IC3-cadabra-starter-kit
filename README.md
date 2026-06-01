# Cadabra Hackathon Starter Kit

Welcome to the **Cadabra Hackathon Starter Kit**! The core goal of this hackathon is to empower you to build innovative Web3 applications that leverage an AI inference agent natively available directly on the blockchain. 

💬 **Join our Discord for help, announcements, and team coordination:** [discord.gg/JGW5HZyU8](https://discord.gg/JGW5HZyU8)

Your smart contracts can ask an AI a question and receive an answer, all fully on-chain, trustlessly. This repository is designed to help you quickly integrate your smart contracts with the global `CadabraInference` service.

## Table of Contents
- [Live Demo](#live-demo)
- [Architecture: How Apps Access the AI](#architecture-how-apps-access-the-ai)
- [Quick Start: What You Need to Know](#quick-start-what-you-need-to-know)
- [Included Reference App](#included-reference-app)
- [How to Run an Example](#how-to-run-an-example)
  - [Deploy Your Own Contract](#deploy-your-own-contract)
- [Local Development (Anvil + Mock Agent)](#local-development-anvil--mock-agent)
- [Deploying to the Cloud](#deploying-to-the-cloud)
- [Troubleshooting](#troubleshooting)

---

## Live Demo

Check out a live, working deployment of the Chat App to see an example of an application that relies on the inference contract:

🔗 **[Live Chat App Demo](https://ic-3-cadabra-starter-kit-fuji.vercel.app?_vercel_share=exdRuLKOAv8SH66dyohNyNy4xmMMQ3rH)**

Connect your MetaMask wallet (on the Avalanche Fuji network), send a message, and watch the decentralized AI respond in real-time! *(Need help setting up your wallet or getting Fuji/Avalanche tokens? See the [Step 1: Set Up MetaMask](#step-1-set-up-metamask) and [Step 2: Get Free Testnet AVAX](#step-2-get-free-testnet-avax) sections below.)*

---

## Architecture: How Apps Access the AI

The Chat reference app interacts with the AI inference service through a standard Solidity interface, making it incredibly easy to build your own dApps on top of the same infrastructure.

The core idea is simple: your smart contract sends a **plain-text prompt** (any string: a question, instruction, or conversation history) to the inference service, and receives back a **plain-text answer** from an AI agent. The prompt is just text; there is no special format required. You request an inference, then later check its state; once finalized, the result (the AI's response) is available to read on-chain.

### The `IDecentralizedAI` Interface

We provide a copy of the interface at the root of this repository for easy reference: [`interfaces/IDecentralizedAI.sol`](./interfaces/IDecentralizedAI.sol). This is the universal interface your smart contract imports to talk to the AI inference service. It is fully documented with NatSpec comments and a usage example. It exposes four functions:

| Function | Description |
|---|---|
| `requestInference(string query)` → `uint256 requestId` | Sends a natural-language query to the AI. Returns a unique `requestId` you use to track and retrieve the result. |
| `isReady(uint256 requestId)` → `bool` | Returns `true` once the AI Agent has proposed and finalized the answer for a given request. |
| `getResult(uint256 requestId)` → `string output` | Returns the current output for a request. Before any agent has proposed, this is an empty string `""`. After proposal but before finalization, it returns the proposed (not yet finalized) answer. Always check `isReady()` first to confirm the result is final. |
| `getRequest(uint256 requestId)` → `(RequestState, query, output, proposer, timestamp)` | Returns the full details of a request, including its current lifecycle state. |

Every request goes through a lifecycle tracked by the `RequestState` enum:
- **`Unproposed`**: The query has been submitted but no AI Agent has responded yet.
- **`Proposed`**: An Agent has submitted a candidate answer and staked a bond.
- **`InDispute`**: Another agent has challenged the proposed answer.
- **`Finalized`**: The answer is accepted and immutable. `getResult()` will return the final output.

### How Your App Contract Uses It

Here is the pattern used by `PublicChat.sol`:

```solidity
import "./interfaces/IDecentralizedAI.sol";

contract MyApp {
    IDecentralizedAI public immutable inferenceService;

    constructor(address inference) {
        inferenceService = IDecentralizedAI(inference);
    }

    function askAI(string memory question) external {
        // 1. Send the query and receive a unique requestId
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

```text
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
                              Answer displayed (no backend needed!)
```

> **Note:** No orchestrator or backend server is required. The frontend polls the inference service directly using `isReady()` and `getResult()`, which are free read-only calls that cost zero gas.

---

## Quick Start: What You Need to Know

### The Network: Avalanche Fuji

All development happens on **Avalanche Fuji**, a free testnet for the Base L2 network. You will deploy contracts, send transactions, and interact with the AI inference service entirely on this network. It costs nothing, as all AVAX used is free testnet AVAX.

| Detail | Value |
|---|---|
| **Network Name** | Avalanche Fuji Testnet |
| **Public RPC URL** | `https://api.avax-test.network/ext/bc/C/rpc` |
| **Chain ID** | `43113` |
| **Currency Symbol** | AVAX |
| **Block Explorer URL** | [testnet.snowtrace.io](https://testnet.snowtrace.io) |

### Step 1: Set Up MetaMask

1. Install the [MetaMask browser extension](https://metamask.io/download/) if you don't have it.

> ⚠️ **Security Note:** Never use your real mainnet wallet for hackathon development. Create a fresh MetaMask account specifically for this event. 

2. **Enable Test Networks:** Open MetaMask, click the network dropdown at the top left, and toggle **"Show test networks"**.

3. **Add Avalanche Fuji:** Since every MetaMask version is a bit different, generally go to MetaMask Networks settings to add a new network, and enter the details from the table above for Avalanche Fuji Testnet.


### Step 2: Get Free Testnet AVAX

You need testnet AVAX to deploy contracts and send transactions. Here's how:

1. **Get Avalanche Fuji AVAX**: You can use the [Avalanche Core Faucet](https://core.app/tools/testnet-faucet/?subnet=c&token=c).

> **Tip:** You only need a small amount of AVAX (0.01 - 0.05 is plenty) to deploy contracts and send messages during the hackathon.

---

## Included Reference App

This repo contains a working reference implementation to help you get started immediately:
**[Public Chat App (`apps/chat`)](./apps/chat)** is a classic multi-user interface where messages are stored on-chain and answered by the decentralized AI agent.

The folder contains a full-stack Web3 application with:
- `contracts/`: A Foundry project containing the Smart Contracts. Foundry is a toolkit for building, testing, and deploying Solidity smart contracts from the command line.
- `web/`: A modern Vite + React frontend powered by `viem`. Vite is a fast frontend build tool and development server for running the React app locally and bundling it for deployment.

> **No backend server or orchestrator is needed!** The frontend reads AI answers directly from the inference service using free `view` calls. You just deploy a contract and host a static website.

---

## How to Run an Example

Let's walk through running the **Chat App** (`apps/chat`).

> **Note:** The repository ships with an already-deployed Chat contract on Avalanche Fuji, so you can run the frontend immediately without deploying anything yourself. If you want to modify the Solidity code and deploy your own version, see the [Deploy Your Own Contract](#deploy-your-own-contract) section below.

### Prerequisites

Before starting, make sure you have:
- **Node.js v22+**: Node.js runs JavaScript outside the browser and provides `npm`, the package manager used to install dependencies and start the web app. Download [here](https://nodejs.org/). 
- **Foundry**. For compiling and deploying Solidity contracts. *Only needed if deploying your own contract*. Install with:
  ```bash
  curl -L https://foundry.paradigm.xyz | bash
  foundryup
  ```

### 1. Set Up Environment
Navigate to the chat app directory:
```bash
cd apps/chat
```

### 2. Install Dependencies
Install all necessary packages:
```bash
npm install
npm run install:all
```

### 3. Start the Web App
Since the chat contract is already deployed on Avalanche Fuji, you can start the frontend right away:

```bash
npm --prefix web run dev
```

Open `http://localhost:5173` in your browser, connect MetaMask, and start chatting with the AI!

---

### Deploy Your Own Contract

If you want to modify the Solidity code and deploy your own version of the contract, you can easily do so. To protect your private key, we recommend prompting for it inline rather than saving it in an environment file.

1. Load the Avalanche Fuji environment (this points the deployment script to the global AI inference service):
   ```bash
   source fuji-env.sh
   ```
2. Export your private key securely (this prompts you to paste it without showing it on screen or saving it in your bash history):
   ```bash
   read -s PRIVATE_KEY
   export PRIVATE_KEY
   ```
   *(Press enter, paste your MetaMask private key, and press Enter again)*
3. Deploy the smart contract:
   ```bash
   npm --prefix contracts run deploy:network
   ```

**How does the web app know about your new contract?**
When you run the deployment script, it automatically creates or updates the `web/public/fuji.json` file with your newly deployed contract address and ABI. The web frontend reads this file on startup, so all you need to do is refresh your browser to interact with your new contract!

---

## Local Development (Anvil + Mock Agent)

If you prefer to develop locally without spending testnet Avalanche Fuji AVAX or waiting for block confirmations, you can run the entire AI infrastructure on your own machine. We provide a self-contained local setup in the `local-setup` folder.

1. **Start Anvil (Local Blockchain)**
   *(If you don't have Anvil, install [Foundry](https://book.getfoundry.sh/getting-started/installation))*
   In a new terminal window, start a local anvil node:
   ```bash
   anvil
   ```
   *(Keep this terminal open)*

2. **Deploy the Local Inference Contract**
   In another terminal, deploy the `CadabraInference` contract to your local Anvil node. This will generate a `localhost.json` configuration file:
   ```bash
   cd local-setup/contracts
   npm install
   npm run deploy:local
   ```

3. **Start the Mock Agent**
   The mock agent listens for AI requests on your local blockchain and automatically answers them. It uses Anvil's default Account #0 which starts pre-funded with 10,000 local AVAX. You can customize its logic in `local-setup/agent/agent.mjs`.
   ```bash
   cd ../agent
   npm install
   npm start
   ```
   *(Keep this terminal open)*

4. **Run the Starter Apps Locally**
   Now that your local infrastructure is running, you can run the sample apps against it. Use the `localhost-env.sh` script instead of `fuji-env.sh`.
   *(Note: All 10 default Anvil accounts start pre-funded with 10,000 local AVAX. You will need to configure MetaMask for your local Anvil chain to interact with the frontend—see the detailed setup section just below!)*

   For example, to run the Chat app locally:
   ```bash
   # From the root of the hackathon-starter-kit:
   source apps/chat/localhost-env.sh
   npm --prefix apps/chat/contracts run deploy:localhost
   npm --prefix apps/chat/web run dev
   ```

   **Using MetaMask with Anvil:**
   To interact with your local apps via the browser, you must connect MetaMask to your Anvil node and fund your account.

   *Step 1: Connect to Localhost*
   1. Open MetaMask and click the network dropdown at the top left.
   2. Select **Add network** → **Add a network manually**.
   3. Enter the following details:
      - Network name: `Localhost 8545`
      - New RPC URL: `http://127.0.0.1:8545`
      - Chain ID: `31337`
      - Currency symbol: `AVAX`
   4. Save and switch to this network.

   *Step 2: Get Local AVAX (Two Options)*
   **Option A: Fund your existing account (Recommended)**
   Keep using your normal MetaMask account. While Anvil is running, open a new terminal and "airdrop" yourself 100 fake AVAX by running:
   ```bash
   cast send YOUR_METAMASK_PUBLIC_ADDRESS --value 100ether --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
   *(Note: Replace `YOUR_METAMASK_PUBLIC_ADDRESS` with your actual 0x address. `cast` is installed automatically with Foundry).*

   **Option B: Import an Anvil account**
   1. In MetaMask, click your account icon → **Import Account**.
   2. Paste Anvil's default private key (Account #1): `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`. This account has 10,000 local AVAX.

> [!TIP]
> **Customizing the Local Agent for Testing:** The local agent provided in `local-setup/agent/agent.mjs` simply echoes back your prompts. Open that file and replace the `getAgentResponse(query)` function to connect to a cool cloud provider (OpenAI, Anthropic) or run an AI locally (Ollama) to test different apps!

---

## Deploying to the Cloud

Since the frontend reads AI answers directly from the inference service (no backend needed!), deploying is as simple as hosting a static website.

### Frontend → Vercel (or any static host)

The `web/` folder is a standard Vite + React app that can be deployed to Vercel, Netlify, GitHub Pages, or any static hosting provider.

**Vercel Deployment Steps:**
1. Push your code to GitHub (make sure `web/public/fuji.json` is committed, as it contains your deployed contract address and ABI).
2. Go to [vercel.com](https://vercel.com), click **Add New Project**, and import your repository.
3. Set the **Root Directory** to your app's `web` folder (e.g. `hackathon-starter-kit/apps/chat/web`).
4. Add the following **Environment Variable** (under Settings → Environment Variables):
   - **Key:** `VITE_NETWORK`  **Value:** `fuji`
   - ⚠️ Make sure to enable it for **Production** (not just Development!).
5. Click **Deploy**.

> **Important:** Every time you redeploy a new smart contract (which generates a new `fuji.json`), you must commit the updated JSON file, push to GitHub, and **Redeploy** on Vercel (without build cache) so the frontend picks up the new contract address.

---

## Troubleshooting

### MetaMask "Still connecting to Avalanche Fuji Testnet" / "Update RPC" Error
If MetaMask is stuck loading or fails to connect to the Avalanche Fuji network, it means the default public RPC is congested or down. To fix this, click "Update RPC" in MetaMask (or go to Settings -> Networks -> Avalanche Fuji Testnet) and change the **New RPC URL** to one of these reliable public backups:
- `https://api.avax-test.network/ext/bc/C/rpc`

### Vercel: Page loads but app is stuck / "localhost.json 404"
This means the `VITE_NETWORK` environment variable is missing or not set for the **Production** environment. Go to Vercel Settings → Environment Variables, set `VITE_NETWORK=fuji` with the **Production** checkbox enabled, and **Redeploy without build cache**.
