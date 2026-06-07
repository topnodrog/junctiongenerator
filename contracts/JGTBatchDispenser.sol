// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title JGTBatchDispenser
/// @notice Batch reward dispenser for JGT attention mining
/// @dev Processes daily rewards in a single transaction to save gas
contract JGTBatchDispenser {
    address public immutable jgtToken;
    address public owner;
    
    uint256 public constant MAX_BATCH_SIZE = 200;
    
    mapping(bytes32 => bool) public processedBatches;
    mapping(uint256 => Batch) public batches;
    uint256 public batchCount;
    
    struct Batch {
        uint256 totalAmount;
        uint256 recipientCount;
        bytes32 batchHash;
        bool executed;
        uint256 executedAt;
    }
    
    event BatchProcessed(uint256 indexed batchId, uint256 recipientCount, uint256 totalAmount, bytes32 batchHash);
    event BatchFailed(uint256 indexed batchId, uint256 failedAtIndex, string reason);
    
    error BatchTooLarge();
    error BatchAlreadyProcessed();
    error InvalidInput();
    error NotOwner();
    error MintFailed();
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    
    constructor(address _jgtToken, address _owner) {
        if (_jgtToken == address(0) || _owner == address(0)) revert InvalidInput();
        jgtToken = _jgtToken;
        owner = _owner;
    }
    
    /// @notice Process a batch of rewards by minting JGT directly to recipients
    function processBatch(
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32 batchHash
    ) external onlyOwner {
        uint256 len = recipients.length;
        if (len == 0 || len != amounts.length) revert InvalidInput();
        if (len > MAX_BATCH_SIZE) revert BatchTooLarge();
        if (processedBatches[batchHash]) revert BatchAlreadyProcessed();
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < len; i++) {
            totalAmount += amounts[i];
            if (recipients[i] == address(0)) revert InvalidInput();
        }
        
        uint256 batchId = batchCount++;
        batches[batchId] = Batch(totalAmount, len, batchHash, true, block.timestamp);
        processedBatches[batchHash] = true;
        
        // Mint tokens directly to recipients (requires token to authorize this contract)
        for (uint256 i = 0; i < len; i++) {
            bool success = IJGTToken(jgtToken).mint(recipients[i], amounts[i]);
            if (!success) {
                emit BatchFailed(batchId, i, "Mint failed");
            }
        }
        
        emit BatchProcessed(batchId, len, totalAmount, batchHash);
    }
    
    function isBatchProcessed(bytes32 batchHash) external view returns (bool) {
        return processedBatches[batchHash];
    }
}

/// @title JGTToken interface
interface IJGTToken {
    function mint(address to, uint256 amount) external returns (bool);
}
