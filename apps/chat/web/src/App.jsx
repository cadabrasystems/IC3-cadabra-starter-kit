import { useState, useEffect, useRef } from 'react';
import { createWalletClient, createPublicClient, custom, http, getContract } from 'viem';
import './index.css';

const NETWORK = import.meta.env.VITE_NETWORK || "sepolia";

// Must match PublicChat.sol REQUEST_TIMEOUT (5 minutes)
const REQUEST_TIMEOUT_SECONDS = 300;

async function ensureWalletChain(walletClient, deployment) {
  const expectedChainId = deployment.chainId;
  const currentChainId = await walletClient.getChainId();
  if (currentChainId === expectedChainId) {
    return;
  }

  try {
    await walletClient.switchChain({ id: expectedChainId });
    return;
  } catch (error) {
    if (error.code !== 4902) {
      throw error;
    }
  }

  await walletClient.addChain({
    chain: {
      id: expectedChainId,
      name: expectedChainId === 84532 ? "Base Sepolia" : `Chain ${expectedChainId}`,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [deployment.rpcUrl] } }
    }
  });
}

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null); // null | 'waiting' | 'slow' | 'expired'
  const [contract, setContract] = useState(null);
  const [walletClient, setWalletClient] = useState(null);
  const [publicClient, setPublicClient] = useState(null);
  const [walletStatus, setWalletStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected' | 'error'
  const [deploymentConfig, setDeploymentConfig] = useState(null);
  const messagesEndRef = useRef(null);
  const settlingRef = useRef(new Set()); // track in-flight settleMessage calls

  // Load deployment config and create a read-only public client (no MetaMask needed)
  useEffect(() => {
    const initReadOnly = async () => {
      try {
        const res = await fetch(`/${NETWORK}.json`);
        const config = await res.json();
        setDeploymentConfig(config);

        const customChain = {
          id: config.chainId,
          name: config.chainId === 84532 ? 'Base Sepolia' : `Chain ${config.chainId}`,
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: { default: { http: [config.rpcUrl] } },
        };

        const pClient = createPublicClient({
          chain: customChain,
          transport: http(config.rpcUrl)
        });
        setPublicClient(pClient);

        // If MetaMask is available and already connected, auto-connect silently
        if (window.ethereum) {
          try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts && accounts.length > 0) {
              await connectWalletWithConfig(config, customChain, pClient);
            }
          } catch (e) {
            // Silently ignore - user can connect manually
          }
        }
      } catch (e) {
        console.error("Failed to load deployment config:", e);
      }
    };
    initReadOnly();
  }, []);

  // Internal wallet connection logic (reusable)
  const connectWalletWithConfig = async (config, customChain, pClient) => {
    const wClient = createWalletClient({
      chain: customChain,
      transport: custom(window.ethereum)
    });

    await wClient.requestAddresses();
    await ensureWalletChain(wClient, config);

    setWalletClient(wClient);

    const chatContract = getContract({
      address: config.chat.address,
      abi: config.chat.abi,
      client: { public: pClient, wallet: wClient }
    });
    setContract(chatContract);
    setWalletStatus('connected');
  };

  // Connect wallet (triggered by user clicking "Connect Wallet")
  const handleConnectWallet = async () => {
    if (!window.ethereum) {
      window.open('https://metamask.io/download/', '_blank');
      return;
    }

    if (!deploymentConfig || !publicClient) return;

    setWalletStatus('connecting');
    try {
      const config = deploymentConfig;
      const customChain = {
        id: config.chainId,
        name: config.chainId === 84532 ? 'Base Sepolia' : `Chain ${config.chainId}`,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [config.rpcUrl] } },
      };

      await connectWalletWithConfig(config, customChain, publicClient);
    } catch (err) {
      console.error("Wallet connection failed:", err);
      setWalletStatus('error');
      // Reset to disconnected after a moment so user can retry
      setTimeout(() => setWalletStatus('disconnected'), 3000);
    }
  };

  // Poll for conversations and active chat messages
  // Reads AI answers directly from the inference service (zero gas) - no orchestrator needed!
  useEffect(() => {
    if (!contract || !publicClient) return;

    let inferenceAddress = null;
    let inferenceAbi = null;

    const fetchState = async () => {
      try {
        // Load inference config once
        if (!inferenceAddress) {
          const res = await fetch(`/${NETWORK}.json`);
          const config = await res.json();
          inferenceAddress = config.inference.address;
          inferenceAbi = config.inference.abi;
        }

        const chats = await contract.read.getChats();
        setConversations(chats.map(c => ({ id: Number(c.id), title: c.title })));

        if (activeChatId) {
          const msgs = await contract.read.getMessages([BigInt(activeChatId)]);
          const displayMessages = msgs.map(m => ({
            role: m.role,
            content: m.content
          }));

          // Check if there's a pending AI request
          const chatDetails = chats.find(c => Number(c.id) === activeChatId);
          if (chatDetails && Number(chatDetails.pendingRequestTimestamp) > 0) {
            const requestId = chatDetails.pendingRequestId;

            // Poll the inference service directly - isReady() is a free view call
            const ready = await publicClient.readContract({
              address: inferenceAddress,
              abi: inferenceAbi,
              functionName: 'isReady',
              args: [requestId]
            });

            if (ready) {
              // Read the AI answer directly from the inference service - free view call
              const result = await publicClient.readContract({
                address: inferenceAddress,
                abi: inferenceAbi,
                functionName: 'getResult',
                args: [requestId]
              });

              // Show the answer immediately in the UI
              displayMessages.push({ role: 'agent', content: result });
              setIsLoading(false);
              setPendingStatus(null);

              // Settle the message on-chain so it persists in chat history
              // This allows old chats to be continued without losing AI responses
              const settleKey = requestId.toString();
              if (walletClient && !settlingRef.current.has(settleKey)) {
                settlingRef.current.add(settleKey);
                (async () => {
                  try {
                    const [account] = await walletClient.getAddresses();
                    const txHash = await contract.write.settleMessage([requestId], { account });
                    await publicClient.waitForTransactionReceipt({ hash: txHash });
                  } catch (settleErr) {
                    console.warn('settleMessage failed (may already be settled):', settleErr.message);
                  } finally {
                    settlingRef.current.delete(settleKey);
                  }
                })();
              }
            } else {
              // Use pendingRequestTimestamp from the chat struct directly
              const pendingTimestamp = Number(chatDetails.pendingRequestTimestamp) || 0;
              const now = Math.floor(Date.now() / 1000);
              const ageSeconds = pendingTimestamp > 0 ? now - pendingTimestamp : 0;

              if (pendingTimestamp > 0 && ageSeconds >= REQUEST_TIMEOUT_SECONDS) {
                // Request has expired - contract will auto-reset on next sendMessage
                displayMessages.push({
                  role: 'agent',
                  content: '⚠️ The AI agent did not respond in time. The request has expired - you can send a new message now.'
                });
                setIsLoading(false);
                setPendingStatus('expired');
              } else if (pendingTimestamp > 0 && ageSeconds > 120) {
                // Agent is slow - show countdown to auto-recovery
                const remaining = REQUEST_TIMEOUT_SECONDS - ageSeconds;
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                displayMessages.push({
                  role: 'agent',
                  content: `⏳ The AI agent is taking longer than expected. If no response arrives, the chat will auto-recover in ${mins}:${secs.toString().padStart(2, '0')}...`
                });
                setIsLoading(true);
                setPendingStatus('slow');
              } else {
                setIsLoading(true);
                setPendingStatus('waiting');
              }
            }
          } else {
            setIsLoading(false);
            setPendingStatus(null);
          }

          setMessages(displayMessages);
        }
      } catch (err) {
        console.error("Error fetching state", err);
      }
    };

    fetchState();
    const interval = setInterval(fetchState, 3000); // poll every 3s
    return () => clearInterval(interval);
  }, [contract, publicClient, activeChatId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNewChat = async () => {
    if (!contract || !walletClient || !publicClient) return;
    try {
      const [account] = await walletClient.getAddresses();
      const title = `Chat ${conversations.length + 1}`;
      const txHash = await contract.write.createChat([title], { account });
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      // It will update on next poll, but we can set activeChatId speculatively
      setActiveChatId(conversations.length + 1);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeChatId || isLoading || !contract || !walletClient || !publicClient) return;

    const content = inputValue.trim();
    setInputValue('');
    setIsLoading(true);

    // Optimistic UI update
    setMessages(prev => [...prev, { role: 'user', content }]);

    try {
      const [account] = await walletClient.getAddresses();
      const txHash = await contract.write.sendMessage([BigInt(activeChatId), content], { account });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const isWalletConnected = walletStatus === 'connected';

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar glass-panel">
        <div className="sidebar-header">
          {isWalletConnected ? (
            <button className="new-chat-btn" onClick={handleNewChat} disabled={!contract}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              New Chat
            </button>
          ) : (
            <button className="new-chat-btn" onClick={handleConnectWallet} disabled={walletStatus === 'connecting'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                <line x1="1" y1="10" x2="23" y2="10"></line>
              </svg>
              {walletStatus === 'connecting' ? 'Connecting...' : walletStatus === 'error' ? 'Retry' : !window.ethereum ? 'Get MetaMask' : 'Connect Wallet'}
            </button>
          )}
        </div>
        <div className="conversation-list">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`conversation-item ${activeChatId === conv.id ? 'active' : ''}`}
              onClick={() => setActiveChatId(conv.id)}
            >
              {conv.title}
            </div>
          ))}
        </div>
      </div>

      {/* Main Area */}
      <div className="main-area">
        {activeChatId ? (
          <>
            <div className="chat-header">
              <h2>{conversations.find(c => c.id === activeChatId)?.title || 'Chat'}</h2>
            </div>
            <div className="messages-container">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <p>Send a message to start the conversation.</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`message-wrapper ${msg.role}`}>
                    <div className="message-bubble">
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="message-wrapper agent">
                  <div className="message-bubble" style={{ opacity: 0.7 }}>
                    {pendingStatus === 'slow' ? '⏳ Waiting for agent...' : 'Thinking...'}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="input-area">
              <form className="input-container" onSubmit={handleSendMessage}>
                <input
                  type="text"
                  className="chat-input"
                  placeholder={isWalletConnected ? "Type a message..." : "Connect wallet to chat..."}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  disabled={isLoading || !contract}
                />
                <button type="submit" className="send-btn" disabled={!inputValue.trim() || isLoading || !contract}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </form>
              <p className="gas-notice">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                Each message is an on-chain transaction and costs a small amount of Sepolia ETH.
              </p>
            </div>
          </>
        ) : (
          <div className="welcome-state">
            <div className="welcome-hero">
              <div className="welcome-icon">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="url(#heroGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <defs>
                    <linearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#8a2be2" />
                      <stop offset="100%" stopColor="#4a00e0" />
                    </linearGradient>
                  </defs>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <h2>On-Chain AI Chat</h2>
              <p className="welcome-subtitle">A fully decentralized AI chatbot - every message lives on the blockchain.</p>
            </div>

            <div className="welcome-cards">
              <div className="welcome-card">
                <div className="welcome-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                    <path d="M2 17l10 5 10-5"></path>
                    <path d="M2 12l10 5 10-5"></path>
                  </svg>
                </div>
                <h3>How It Works</h3>
                <p>Your messages are sent as smart contract transactions. An on-chain AI agent processes them through an AI model and returns the response directly to the blockchain.</p>
              </div>

              <div className="welcome-card">
                <div className="welcome-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                </div>
                <h3>Gas Costs</h3>
                <p>Creating chats and sending messages are on-chain transactions. Each one costs a small amount of <strong>Sepolia ETH</strong> (testnet - no real money). Get free ETH from the <a href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noopener noreferrer">Google Cloud Faucet</a>.</p>
              </div>

              <div className="welcome-card">
                <div className="welcome-card-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </div>
                <h3>Fully On-Chain</h3>
                <p>Your entire conversation history is stored on the blockchain - transparent, verifiable, and censorship-resistant. No centralized server involved.</p>
              </div>
            </div>

            {!isWalletConnected && (
              <div className="welcome-connect">
                {!window.ethereum ? (
                  <p className="welcome-cta">To start chatting, install <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer"><strong>MetaMask</strong></a> and connect your wallet.</p>
                ) : (
                  <p className="welcome-cta">Click <strong>Connect Wallet</strong> in the sidebar to get started.</p>
                )}
              </div>
            )}
            {isWalletConnected && (
              <p className="welcome-cta">Click <strong>New Chat</strong> in the sidebar to get started.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
