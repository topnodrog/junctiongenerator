// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title JGTBatchDispenser
/// @notice Batch reward dispenser for JGT attention mining
/// @dev Processes daily rewards in a single transaction to save gas
contract JGTBatchDispenser is Ownable, ReentrancyGuard {
    
    IERC20 public immutable jgtToken;
    
    /// @notice Maximum number of recipients per batch (gas limit safety)
    uint256 public constant MAX_BATCH_SIZE = 200;
    
    /// @notice Maps transaction hashes to prevent replay
    mapping(bytes32 => public processedBatches;
    
    /// @notice Batch statistics
    mapping(uint256 => Batch) public batches;
    uint256 public batchCount;
    
    struct Batch {
        uint256 totalAmount;
        uint256 recipientCount;
        bytes32 batchHash;
        bool executed;
        uint256 executedAt;
    }
    
    event BatchProcessed(
        uint256 indexed batchId,
        uint256 recipientCount,
        uint256 totalAmount,
        bytes32 batchHash
    );
    
    event BatchFailed(
        uint256 indexed batchId,
        uint256 failedAtIndex,
        string reason
    );
    
    event TokenRecovered(
        address token,
        uint256 amount,
        uint256 timestamp
    );
    
    error BatchTooLarge(uint256 count, uint256 max);
    error BatchAlreadyProcessed(bytes32 batchHash);
    error TokenSendFailed(address recipient, uint256 amount);
    error InvalidInput();
    
    constructor(address _jgtToken, address _owner) Ownable(_owner) {
        if (_jgtToken == address(0)) revert InvalidInput();
        jgtToken = IERC20(_jgtToken);
    }
    
    /// @notice Process a batch of rewards in a single transaction
    /// @dev Uses Merkle-proof-style batch hash to prevent replays
    /// @param recipients Array of wallet addresses
    /// @param amounts Array of reward amounts (must match recipients length)
    /// @param batchHash Unique hash for this batch (computed off-chain)
    function processBatch(
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32 batchHash
    ) external onlyOwner nonReentrant {
        uint256 len = recipients.length;
        
        // Validation
        if (len == 0 || len != amounts.length) revert InvalidInput();
        if (len > MAX_BATCH_SIZE) revert BatchTooLarge(len, MAX_BATCH_SIZE);
        if (processedBatches[batchHash]) revert BatchAlreadyProcessed(batchHash);
        
        // Calculate total
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < len; i++) {
            totalAmount += amounts[i];
            if (recipients[i] == address(0)) revert InvalidInput();
        }
        
        // Verify contract has enough tokens
        uint256 contractBalance = jgtToken.balanceOf(address(this));
        if (contractBalance < totalAmount) revert InvalidInput();
        
        // Record batch
        uint256 batchId = batchCount++;
        batches[batchId] = Batch({
            totalAmount: totalAmount,
            recipientCount: len,
            batchHash: batchHash,
            executed: true,
            executedAt: block.timestamp
        });
        processedBatches[batchHash] = true;
        
        // Process transfers
        bool allSucceeded = true;
        for (uint256 i = 0; i < len; i++) {
            try jgtToken.transfer(recipients[i], amounts[i]) {
                // Success
            } catch {
                // Log failure but continue processing
                emit BatchFailed(batchId, i, "Transfer failed");
                allSucceeded = false;
            }
        }
        
        emit BatchProcessed(batchId, len, totalAmount, batchHash);
    }
    
    @notice Deposit JGT tokens into the dispenser for rewards
    /// @param amount Amount of JGT tokens to deposit
    function depositTokens(uint256 amount) external {
        if (amount == 0) revert InvalidInput();
        jgtToken.transferFrom(msg.sender, address(this), amount);
    }
    
    @notice Get the contract's JGT token balance
    function getBalance() external view returns (uint256) {
        return jgtToken.balanceOf(address(this));
    }
    
    /// @notice Check if a batch hash has been processed
    function isBatchProcessed(bytes32 batchHash) external view returns (bool) {
        return processedBatches[batchHash];
    }
    
    /// @notice Emergency recovery of stuck tokens
    /// @param token Address of token to recover (cannot be JGT)
    /// @param amount Amount to recover
    function recoverTokens(address token, uint256 amount) external {
        if (token == address(jgtToken)) revert InvalidInput();
        IERC20(token).transfer(owner(), amount);
        emit TokenRecovered(token, amount, block.timestamp);
    }
}
