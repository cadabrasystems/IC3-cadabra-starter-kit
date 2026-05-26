// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IDecentralizedAI {
    enum RequestState {
        Unproposed,
        Proposed,
        InDispute,
        Finalized
    }

    function requestInference(
        string calldata query
    ) external returns (uint256 requestId);
    function getResult(
        uint256 requestId
    ) external view returns (string memory output);
    function isReady(uint256 requestId) external view returns (bool);
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
