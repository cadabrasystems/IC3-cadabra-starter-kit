// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./interfaces/IDecentralizedAI.sol";

contract PublicChat {
    IDecentralizedAI public immutable inferenceService;
    uint256 public constant REQUEST_TIMEOUT = 5 minutes;

    struct Message {
        address sender;
        string role; // "user" or "agent"
        string content;
        uint256 timestamp;
    }

    struct Chat {
        uint256 id;
        string title;
        uint256 messageCount;
        uint256 pendingRequestId;
        uint256 pendingRequestTimestamp;
    }

    uint256 public nextChatId = 1;
    mapping(uint256 => Chat) public chats;
    mapping(uint256 => mapping(uint256 => Message)) public chatMessages;
    
    // Mapping from inference request ID to Chat ID
    mapping(uint256 => uint256) public requestToChatId;

    event ChatCreated(uint256 indexed chatId, string title);
    event MessageAdded(uint256 indexed chatId, address indexed sender, string role, string content);
    event InferenceRequested(uint256 indexed chatId, uint256 indexed requestId, string query);
    event MessageSettled(uint256 indexed chatId, uint256 indexed requestId, string content);
    event PendingRequestExpired(uint256 indexed chatId, uint256 indexed requestId);

    error ChatDoesNotExist();
    error ChatIsWaitingForAgent();
    error RequestNotReady();

    constructor(address inference) {
        inferenceService = IDecentralizedAI(inference);
    }

    function createChat(string memory title) external returns (uint256) {
        uint256 chatId = nextChatId++;
        chats[chatId] = Chat({
            id: chatId,
            title: title,
            messageCount: 0,
            pendingRequestId: 0,
            pendingRequestTimestamp: 0
        });

        emit ChatCreated(chatId, title);
        return chatId;
    }

    function sendMessage(uint256 chatId, string memory content) external {
        Chat storage chat = chats[chatId];
        if (chat.id == 0) revert ChatDoesNotExist();

        // Auto-expire stale pending requests instead of permanently blocking the chat
        if (chat.pendingRequestId != 0) {
            if (block.timestamp < chat.pendingRequestTimestamp + REQUEST_TIMEOUT) {
                revert ChatIsWaitingForAgent();
            }
            // Request timed out - expire it and allow the new message
            emit PendingRequestExpired(chatId, chat.pendingRequestId);
            chat.pendingRequestId = 0;
            chat.pendingRequestTimestamp = 0;
        }

        // Add user message
        uint256 msgIndex = chat.messageCount++;
        chatMessages[chatId][msgIndex] = Message({
            sender: msgIndex == 0 ? msg.sender : chatMessages[chatId][0].sender,
            role: "user",
            content: content,
            timestamp: block.timestamp
        });
        emit MessageAdded(chatId, msg.sender, "user", content);

        // Build the prompt by combining history (super basic formatting)
        string memory query = _buildPrompt(chatId);

        // Request inference
        uint256 requestId = inferenceService.requestInference(query);
        chat.pendingRequestId = requestId;
        chat.pendingRequestTimestamp = block.timestamp;
        requestToChatId[requestId] = chatId;

        emit InferenceRequested(chatId, requestId, query);
    }

    function settleMessage(uint256 requestId) external {
        uint256 chatId = requestToChatId[requestId];
        Chat storage chat = chats[chatId];
        
        if (chat.pendingRequestId != requestId) revert RequestNotReady();
        if (!inferenceService.isReady(requestId)) revert RequestNotReady();

        string memory output = inferenceService.getResult(requestId);

        // Add agent message
        uint256 msgIndex = chat.messageCount++;
        chatMessages[chatId][msgIndex] = Message({
            sender: address(this),
            role: "agent",
            content: output,
            timestamp: block.timestamp
        });

        chat.pendingRequestId = 0;
        chat.pendingRequestTimestamp = 0;

        emit MessageSettled(chatId, requestId, output);
        emit MessageAdded(chatId, address(this), "agent", output);
    }

    function getMessages(uint256 chatId) external view returns (Message[] memory) {
        Chat storage chat = chats[chatId];
        Message[] memory msgs = new Message[](chat.messageCount);
        for (uint256 i = 0; i < chat.messageCount; i++) {
            msgs[i] = chatMessages[chatId][i];
        }
        return msgs;
    }

    function getChats() external view returns (Chat[] memory) {
        Chat[] memory allChats = new Chat[](nextChatId - 1);
        for (uint256 i = 1; i < nextChatId; i++) {
            allChats[i - 1] = chats[i];
        }
        return allChats;
    }

    function _buildPrompt(uint256 chatId) internal view returns (string memory) {
        Chat storage chat = chats[chatId];
        string memory prompt = "You are a helpful AI assistant. Complete the conversation below by providing the next message for the 'agent'. Do not prefix your response with 'agent:', just provide the message content.\n\nConversation so far:\n";
        for (uint256 i = 0; i < chat.messageCount; i++) {
            Message storage m = chatMessages[chatId][i];
            prompt = string.concat(prompt, m.role, ": ", m.content, "\n");
        }
        return string.concat(prompt, "agent: ");
    }
}
