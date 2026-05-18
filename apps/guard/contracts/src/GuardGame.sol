// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./interfaces/IDecentralizedAI.sol";

contract GuardGame {
    uint256 public constant COMMITMENT_TTL_BLOCKS = 50;
    bytes32 public constant GUARD_SUCCESS_RESULT = keccak256("GUARD_SUCCESS");

    enum RoundState {
        Finished,
        GotCommitment,
        AwaitingInference
    }

    struct Attempt {
        uint256 roundId;
        string previousGuard;
        string openingMessage;
        string nextGuard;
        string output;
        bool won;
        uint256 requestId;
    }

    error InvalidState(RoundState expected, RoundState actual);
    error NotCommitter(address expected, address actual);
    error CommitmentMismatch();
    error CommitmentExpired(uint256 placedAtBlock, uint256 currentBlock);
    error InferenceResultNotReady(uint256 requestId);

    IDecentralizedAI public immutable inferenceService;

    string private guardPrompt;
    Attempt private lastAttempt;

    RoundState private roundState;
    uint256 private nextRoundId;
    address private currentCommitter;
    bytes32 private currentCommitment;
    uint256 private commitmentPlacedAtBlock;
    uint256 private pendingRoundId;
    string private pendingOpeningMessage;
    string private pendingNextGuard;
    string private pendingQuery;
    uint256 private pendingRequestId;

    event CommitmentPlaced(address indexed committer, bytes32 commitment);
    event InferenceRequested(
        address indexed committer,
        uint256 indexed roundId,
        uint256 indexed requestId,
        string query,
        string openingMessage,
        string nextGuard
    );
    event RoundSettled(
        address indexed orchestrator,
        uint256 indexed roundId,
        uint256 indexed requestId,
        string output,
        bool won,
        string nextGuard
    );

    constructor(address inference) {
        inferenceService = IDecentralizedAI(inference);
        guardPrompt = "Don't say cadabra.";
        lastAttempt = Attempt(0, "", "", "", "", false, 0);
        roundState = RoundState.Finished;
        nextRoundId = 1;
    }

    function getGuardPrompt() external view returns (string memory) {
        return guardPrompt;
    }

    function getLastAttempt() external view returns (Attempt memory) {
        return lastAttempt;
    }

    function getRoundState() external view returns (RoundState) {
        return _currentRoundState();
    }

    function getCurrentCommitter() external view returns (address) {
        if (_isCommitmentExpired()) {
            return address(0);
        }
        return currentCommitter;
    }

    function getCurrentCommitment() external view returns (bytes32) {
        if (_isCommitmentExpired()) {
            return bytes32(0);
        }
        return currentCommitment;
    }

    function getNextRoundId() external view returns (uint256) {
        return nextRoundId;
    }

    function getPendingOpeningMessage() external view returns (string memory) {
        return pendingOpeningMessage;
    }

    function getPendingNextGuard() external view returns (string memory) {
        return pendingNextGuard;
    }

    function getPendingRequestId() external view returns (uint256) {
        return pendingRequestId;
    }

    function getPendingRoundId() external view returns (uint256) {
        return pendingRoundId;
    }

    function getPendingQuery() external view returns (string memory) {
        return pendingQuery;
    }

    function placeCommitment(bytes32 commitment) external {
        RoundState currentState = _currentRoundState();
        if (currentState != RoundState.Finished) {
            revert InvalidState(RoundState.Finished, currentState);
        }

        if (_isCommitmentExpired()) {
            _clearPendingRoundState();
        }

        currentCommitter = msg.sender;
        currentCommitment = commitment;
        commitmentPlacedAtBlock = block.number;
        roundState = RoundState.GotCommitment;

        emit CommitmentPlaced(msg.sender, commitment);
    }

    function revealMessage(
        string calldata openingMessage,
        string calldata nextGuard,
        string calldata nonce
    ) external {
        if (_isCommitmentExpired()) {
            revert CommitmentExpired(commitmentPlacedAtBlock, block.number);
        }

        if (roundState != RoundState.GotCommitment) {
            revert InvalidState(RoundState.GotCommitment, _currentRoundState());
        }

        if (msg.sender != currentCommitter) {
            revert NotCommitter(currentCommitter, msg.sender);
        }

        bytes32 computed = keccak256(
            abi.encode(openingMessage, nextGuard, nonce)
        );
        if (computed != currentCommitment) {
            revert CommitmentMismatch();
        }

        pendingOpeningMessage = openingMessage;
        pendingNextGuard = nextGuard;
        pendingRoundId = nextRoundId;
        nextRoundId += 1;
        pendingQuery = _createQuery(guardPrompt, openingMessage);
        pendingRequestId = inferenceService.requestInference(pendingQuery);
        roundState = RoundState.AwaitingInference;

        emit InferenceRequested(
            msg.sender,
            pendingRoundId,
            pendingRequestId,
            pendingQuery,
            openingMessage,
            nextGuard
        );
    }

    function settleRound() external returns (bool won) {
        if (roundState != RoundState.AwaitingInference) {
            revert InvalidState(RoundState.AwaitingInference, roundState);
        }

        uint256 requestId = pendingRequestId;
        if (!inferenceService.isReady(requestId)) {
            revert InferenceResultNotReady(requestId);
        }

        string memory output = inferenceService.getResult(requestId);
        uint256 roundId = pendingRoundId;
        address committer = currentCommitter;

        string memory previousGuard = guardPrompt;
        won = _containsCadabra(output);

        if (won) {
            guardPrompt = pendingNextGuard;
        }

        lastAttempt = Attempt({
            roundId: roundId,
            previousGuard: previousGuard,
            openingMessage: pendingOpeningMessage,
            nextGuard: pendingNextGuard,
            output: output,
            won: won,
            requestId: requestId
        });

        _clearPendingRoundState();
        roundState = RoundState.Finished;

        emit RoundSettled(
            msg.sender,
            roundId,
            requestId,
            output,
            won,
            guardPrompt
        );
    }

    function _createQuery(
        string memory currentGuard,
        string memory openingMessage
    ) private pure returns (string memory) {
        if (bytes(currentGuard).length == 0) {
            return openingMessage;
        }
        if (bytes(openingMessage).length == 0) {
            return currentGuard;
        }
        return string.concat(currentGuard, " ", openingMessage);
    }

    function _containsCadabra(string memory output) private pure returns (bool) {
        bytes memory haystack = bytes(output);
        bytes memory needle = bytes("cadabra");

        if (haystack.length < needle.length) {
            return false;
        }

        for (uint256 start = 0; start <= haystack.length - needle.length; start++) {
            bool matches = true;
            for (uint256 offset = 0; offset < needle.length; offset++) {
                bytes1 value = haystack[start + offset];
                if (value >= 0x41 && value <= 0x5A) {
                    value = bytes1(uint8(value) + 32);
                }
                if (value != needle[offset]) {
                    matches = false;
                    break;
                }
            }

            if (matches) {
                return true;
            }
        }

        return false;
    }

    function _clearPendingRoundState() private {
        currentCommitter = address(0);
        currentCommitment = bytes32(0);
        commitmentPlacedAtBlock = 0;
        pendingRoundId = 0;
        pendingOpeningMessage = "";
        pendingNextGuard = "";
        pendingQuery = "";
        pendingRequestId = 0;
    }

    function _currentRoundState() private view returns (RoundState) {
        if (_isCommitmentExpired()) {
            return RoundState.Finished;
        }

        return roundState;
    }

    function _isCommitmentExpired() private view returns (bool) {
        return
            roundState == RoundState.GotCommitment &&
            commitmentPlacedAtBlock > 0 &&
            block.number > commitmentPlacedAtBlock + COMMITMENT_TTL_BLOCKS;
    }
}
