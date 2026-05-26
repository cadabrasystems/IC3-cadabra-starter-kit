// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./IDecentralizedAI.sol";

contract CadabraInference is IDecentralizedAI {
    uint256 public constant CHALLENGE_WINDOW = 0;
    uint256 public constant MIN_BOND = 0.001 ether;

    address public owner;
    mapping(address => bool) public isProposer;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setProposer(address agent, bool authorized) external onlyOwner {
        isProposer[agent] = authorized;
    }

    receive() external payable {}

    struct Request {
        string query;
        string output;
        RequestState state;
        uint256 requestedAt;
        address proposer;
        uint256 proposalTimestamp;
        uint256 rewardPot;
        address challenger;
        string challengerOutput;
        uint256 challengerBond;
        address disputeContract;
    }

    mapping(uint256 => Request) public requests;
    uint256 public nextRequestId;

    event InferenceRequested(uint256 indexed requestId, string query);
    event ResultProposed(
        uint256 indexed requestId,
        string output,
        address proposer,
        uint256 rewardPot
    );
    event DisputeOpened(
        uint256 indexed requestId,
        address indexed challenger,
        string challengerOutput,
        address disputeContract
    );
    event DisputeResolved(
        uint256 indexed requestId,
        address indexed winningProposer,
        string winningOutput,
        uint256 rewardPot
    );
    event Finalized(
        uint256 indexed requestId,
        string output,
        address proposer,
        uint256 rewardPot
    );

    modifier requestExists(uint256 requestId) {
        require(requestId < nextRequestId, "Unknown request");
        _;
    }

    function requestInference(
        string calldata query
    ) external override returns (uint256 requestId) {
        requestId = nextRequestId++;

        requests[requestId] = Request({
            query: query,
            output: "",
            state: RequestState.Unproposed,
            requestedAt: block.timestamp,
            proposer: address(0),
            proposalTimestamp: 0,
            rewardPot: 0,
            challenger: address(0),
            challengerOutput: "",
            challengerBond: 0,
            disputeContract: address(0)
        });

        emit InferenceRequested(requestId, query);
    }

    function proposeResult(
        uint256 requestId,
        string calldata output
    ) external payable requestExists(requestId) {
        require(isProposer[msg.sender] || msg.sender == owner, "Not authorized to propose");
        
        Request storage req = requests[requestId];
        require(req.state == RequestState.Unproposed, "Already proposed");
        require(bytes(output).length > 0, "Empty output");
        require(msg.value >= MIN_BOND, "Insufficient bond");

        req.output = output;
        req.proposer = msg.sender;
        req.proposalTimestamp = block.timestamp;
        req.rewardPot = msg.value;
        req.state = RequestState.Proposed;

        emit ResultProposed(requestId, output, msg.sender, req.rewardPot);
    }

    function challenge(
        uint256 requestId,
        string calldata challengerOutput,
        address disputeContract
    ) external payable requestExists(requestId) {
        Request storage req = requests[requestId];
        require(req.state == RequestState.Proposed, "Not proposed");
        require(
            block.timestamp < req.proposalTimestamp + CHALLENGE_WINDOW,
            "Challenge window closed"
        );
        require(bytes(challengerOutput).length > 0, "Empty challenger output");
        require(disputeContract != address(0), "Missing dispute contract");
        require(msg.value >= MIN_BOND, "Insufficient bond");

        req.state = RequestState.InDispute;
        req.challenger = msg.sender;
        req.challengerOutput = challengerOutput;
        req.challengerBond = msg.value;
        req.disputeContract = disputeContract;

        emit DisputeOpened(
            requestId,
            msg.sender,
            challengerOutput,
            disputeContract
        );
    }

    function recordDisputeOutcome(
        uint256 requestId,
        address winningProposer,
        string calldata winningOutput
    ) external requestExists(requestId) {
        Request storage req = requests[requestId];
        require(req.state == RequestState.InDispute, "Not in dispute");
        require(msg.sender == req.disputeContract, "Unauthorized dispute resolver");
        require(bytes(winningOutput).length > 0, "Empty output");
        require(
            winningProposer == req.proposer || winningProposer == req.challenger,
            "Unknown winner"
        );

        req.rewardPot += req.challengerBond;
        req.proposer = winningProposer;
        req.output = winningOutput;
        req.proposalTimestamp = block.timestamp;
        req.state = RequestState.Proposed;

        req.challenger = address(0);
        req.challengerOutput = "";
        req.challengerBond = 0;
        req.disputeContract = address(0);

        emit DisputeResolved(
            requestId,
            winningProposer,
            winningOutput,
            req.rewardPot
        );
    }

    function resolve(uint256 requestId) external requestExists(requestId) {
        Request storage req = requests[requestId];
        require(req.state == RequestState.Proposed, "Not proposed");
        require(
            block.timestamp >= req.proposalTimestamp + CHALLENGE_WINDOW,
            "Window not closed"
        );

        req.state = RequestState.Finalized;
        uint256 reward = req.rewardPot;
        address proposer = req.proposer;
        string memory output = req.output;

        emit Finalized(requestId, output, proposer, reward);

        if (reward > 0) {
            (bool sent, ) = payable(proposer).call{value: reward}("");
            require(sent, "Reward transfer failed");
        }

    }

    function getResult(
        uint256 requestId
    ) external view override requestExists(requestId) returns (string memory output) {
        return requests[requestId].output;
    }

    function isReady(
        uint256 requestId
    ) external view override requestExists(requestId) returns (bool) {
        return requests[requestId].state == RequestState.Finalized;
    }

    function getRequest(
        uint256 requestId
    )
        external
        view
        override
        requestExists(requestId)
        returns (
            RequestState state,
            string memory query,
            string memory output,
            address proposer,
            uint256 proposalTimestamp
        )
    {
        Request storage req = requests[requestId];
        return (
            req.state,
            req.query,
            req.output,
            req.proposer,
            req.proposalTimestamp
        );
    }
}
