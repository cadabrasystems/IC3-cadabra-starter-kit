import { useState, useEffect, useRef } from 'react';
import { createWalletClient, createPublicClient, custom, getContract } from 'viem';
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
  const messagesEndRef = useRef(null);

  // Initialize Viem
  useEffect(() => {
    const initViem = async () => {
      try {
        const res = await fetch(`/${NETWORK}.json`);
        const config = await res.json();

        if (window.ethereum) {
          const customChain = {
            id: config.chainId,
            name: config.chainId === 84532 ? 'Base Sepolia' : `Chain ${config.chainId}`,
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: [config.rpcUrl] } },
          };

          const wClient = createWalletClient({
            chain: customChain,
            transport: custom(window.ethereum)
          });
          const pClient = createPublicClient({
            chain: customChain,
            transport: custom(window.ethereum)
          });
          
          await wClient.requestAddresses();
          await ensureWalletChain(wClient, config);
          
          setWalletClient(wClient);
          setPublicClient(pClient);

          const chatContract = getContract({
            address: config.chat.address,
            abi: config.chat.abi,
            client: { public: pClient, wallet: wClient }
          });
          setContract(chatContract);
        } else {
          console.warn("No Web3 wallet found, falling back to read-only mode");
          return;
        }
      } catch (e) {
        console.error("Failed to load network config:", e);
      }
    };
    initViem();
  }, []);

  // Poll for conversations and active chat messages
  // Reads AI answers directly from the Oracle (zero gas) — no orchestrator needed!
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
          if (chatDetails && Number(chatDetails.pendingRequestId) > 0) {
            const requestId = chatDetails.pendingRequestId;

            // Poll the Oracle directly — isReady() is a free view call
            const ready = await publicClient.readContract({
              address: inferenceAddress,
              abi: inferenceAbi,
              functionName: 'isReady',
              args: [requestId]
            });

            if (ready) {
              // Read the AI answer directly from the Oracle — free view call
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
            } else {
              // Use pendingRequestTimestamp from the chat struct directly
              const pendingTimestamp = Number(chatDetails.pendingRequestTimestamp) || 0;
              const now = Math.floor(Date.now() / 1000);
              const ageSeconds = pendingTimestamp > 0 ? now - pendingTimestamp : 0;

              if (pendingTimestamp > 0 && ageSeconds >= REQUEST_TIMEOUT_SECONDS) {
                // Request has expired — contract will auto-reset on next sendMessage
                displayMessages.push({
                  role: 'agent',
                  content: '⚠️ The AI agent did not respond in time. The request has expired — you can send a new message now.'
                });
                setIsLoading(false);
                setPendingStatus('expired');
              } else if (pendingTimestamp > 0 && ageSeconds > 120) {
                // Agent is slow — show countdown to auto-recovery
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

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar glass-panel">
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={handleNewChat} disabled={!contract}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New Chat
          </button>
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
                  placeholder="Type a message..." 
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
            </div>
          </>
        ) : (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(138, 43, 226, 0.5)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <h2>Select or start a new conversation</h2>
            {!contract && <p style={{fontSize: '0.9rem'}}>Please connect your Web3 wallet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
