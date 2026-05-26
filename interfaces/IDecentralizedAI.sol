// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IDecentralizedAI - The Cadabra AI Interface
 * @notice This is the universal interface your smart contract uses to interact
 *         with the decentralized AI inference service on Base Sepolia.
 *
 * ## How It Works
 *
 *   1. Your contract calls `requestInference(query)` with a plain-text prompt
 *      (e.g. "What is the capital of France?"). This returns a unique `requestId`.
 *
 *   2. Off-chain, an AI Agent detects your request, processes it (e.g. via OpenAI),
 *      and writes the proposed answer back on-chain.
 *
 *   3. Your contract (or an orchestrator) polls `isReady(requestId)` to check
 *      whether the answer has been finalized.
 *
 *   4. Once ready, call `getResult(requestId)` to retrieve the AI's plain-text
 *      answer, or call `getRequest(requestId)` for the full request details
 *      including its lifecycle state.
 *
 * ## Request Lifecycle (RequestState)
 *
 *   Unproposed → Proposed → Finalized
 *                    ↘ InDispute ↗
 *
 *   - Unproposed:  Query submitted, no agent has responded yet.
 *   - Proposed:    An agent submitted a candidate answer and staked a bond.
 *   - InDispute:   Another participant challenged the proposed answer.
 *   - Finalized:   The answer is accepted and immutable. Safe to read via getResult().
 *
 * ## Usage Example
 *
 *   ```solidity
 *   import "./interfaces/IDecentralizedAI.sol";
 *
 *   contract MyApp {
 *       IDecentralizedAI public immutable aiService;
 *
 *       constructor(address serviceAddress) {
 *           aiService = IDecentralizedAI(serviceAddress);
 *       }
 *
 *       function ask(string memory prompt) external returns (uint256) {
 *           return aiService.requestInference(prompt);
 *       }
 *
 *       function readAnswer(uint256 requestId) external view returns (string memory) {
 *           require(aiService.isReady(requestId), "Answer not ready yet");
 *           return aiService.getResult(requestId);
 *       }
 *   }
 *   ```
 */
interface IDecentralizedAI {
    /// @notice The lifecycle state of an inference request.
    enum RequestState {
        Unproposed,  // Query submitted, awaiting an agent response
        Proposed,    // Agent proposed an answer (bonded)
        InDispute,   // Answer is being challenged
        Finalized    // Answer accepted - safe to read via getResult()
    }

    /// @notice Submit a plain-text prompt to the AI inference service.
    /// @param query The natural-language prompt (e.g. "Summarize this article: ...").
    /// @return requestId A unique identifier to track and retrieve the result.
    function requestInference(
        string calldata query
    ) external returns (uint256 requestId);

    /// @notice Retrieve the finalized AI-generated answer.
    /// @param requestId The ID returned by requestInference().
    /// @return output The AI's plain-text response.
    function getResult(
        uint256 requestId
    ) external view returns (string memory output);

    /// @notice Check whether an inference request has been finalized.
    /// @param requestId The ID returned by requestInference().
    /// @return True if the answer is ready to read via getResult().
    function isReady(uint256 requestId) external view returns (bool);

    /// @notice Get the full details of an inference request.
    /// @param requestId The ID returned by requestInference().
    /// @return state The current lifecycle state of the request.
    /// @return query The original prompt that was submitted.
    /// @return output The proposed/finalized answer (empty if Unproposed).
    /// @return proposer The address of the agent that proposed the answer.
    /// @return proposalTimestamp The block timestamp when the answer was proposed.
    function getRequest(
        uint256 requestId
    )
        external
        view
        returns (
            RequestState state,
            string memory query,
            string memory output,
            address proposer,
            uint256 proposalTimestamp
        );
}
