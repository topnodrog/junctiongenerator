// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title JGTStaking
/// @notice Staking contract for JGT token
/// @dev Users stake JGT to earn a share of platform revenue
contract JGTStaking {
    address public immutable jgtToken;
    address public owner;
    
    uint256 public totalStaked;
    uint256 public rewardPool;
    uint256 public constant REWARD_RATE = 3; // 3% APY (simple)
    uint256 public constant MIN_STAKE = 100 * 10**18; // 100 JGT minimum
    uint256 public constant LOCK_PERIOD = 7 days;
    
    struct Stake {
        uint256 amount;
        uint256 stakedAt;
        uint256 rewardDebt;
        bool active;
    }
    
    mapping(address => Stake) public stakes;
    mapping(address => bool) public authorizedRewardSources;
    
    event Staked(address indexed user, uint256 amount, uint256 timestamp);
    event Unstaked(address indexed user, uint256 amount, uint256 reward, uint256 timestamp);
    event RewardClaimed(address indexed user, uint256 amount, uint256 timestamp);
    event RewardPoolFunded(uint256 amount, uint256 timestamp);
    
    error InsufficientStake();
    error LockPeriodActive();
    error NoActiveStake();
    error InvalidAmount();
    error NotOwner();
    error TransferFailed();
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    
    constructor(address _jgtToken, address _owner) {
        if (_jgtToken == address(0) || _owner == address(0)) revert InvalidAmount();
        jgtToken = _jgtToken;
        owner = _owner;
    }
    
    /// @notice Stake JGT tokens
    function stake(uint256 amount) external {
        if (amount < MIN_STAKE) revert InvalidAmount();
        
        // Transfer JGT from user to this contract
        bool success = IJGTToken(jgtToken).transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();
        
        Stake storage s = stakes[msg.sender];
        
        // If already staking, accumulate reward first
        if (s.active) {
            uint256 pending = calculateReward(msg.sender);
            s.rewardDebt += pending;
        }
        
        s.amount += amount;
        s.stakedAt = block.timestamp;
        s.active = true;
        totalStaked += amount;
        
        emit Staked(msg.sender, amount, block.timestamp);
    }
    
    /// @notice Unstake JGT tokens (after lock period)
    function unstake() external {
        Stake storage s = stakes[msg.sender];
        if (!s.active) revert NoActiveStake();
        if (block.timestamp < s.stakedAt + LOCK_PERIOD) revert LockPeriodActive();
        
        uint256 amount = s.amount;
        uint256 reward = calculateReward(msg.sender) + s.rewardDebt;
        
        s.amount = 0;
        s.active = false;
        s.rewardDebt = 0;
        totalStaked -= amount;
        
        // Transfer staked tokens back
        bool success = IJGTToken(jgtToken).transfer(msg.sender, amount);
        if (!success) revert TransferFailed();
        
        // Mint reward tokens (contract must be authorized minter)
        if (reward > 0) {
            IJGTToken(jgtToken).mint(msg.sender, reward);
        }
        
        emit Unstaked(msg.sender, amount, reward, block.timestamp);
    }
    
    /// @notice Claim accumulated rewards without unstaking
    function claimReward() external {
        Stake storage s = stakes[msg.sender];
        if (!s.active) revert NoActiveStake();
        
        uint256 reward = calculateReward(msg.sender) + s.rewardDebt;
        if (reward == 0) revert InvalidAmount();
        
        s.rewardDebt = 0;
        s.stakedAt = block.timestamp; // Reset timer
        
        // Mint reward tokens
        IJGTToken(jgtToken).mint(msg.sender, reward);
        
        emit RewardClaimed(msg.sender, reward, block.timestamp);
    }
    
    /// @notice Calculate pending reward for a staker
    function calculateReward(address user) public view returns (uint256) {
        Stake storage s = stakes[user];
        if (!s.active) return 0;
        
        uint256 duration = block.timestamp - s.stakedAt;
        // Simple interest: amount * rate * time / (365 days * 100)
        uint256 reward = (s.amount * REWARD_RATE * duration) / (365 days * 100);
        return reward;
    }
    
    /// @notice Get pending reward for a user
    function pendingReward(address user) external view returns (uint256) {
        return calculateReward(user) + stakes[user].rewardDebt;
    }
    
    /// @notice Fund the reward pool (owner only)
    function fundRewardPool(uint256 amount) external onlyOwner {
        bool success = IJGTToken(jgtToken).transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();
        rewardPool += amount;
        emit RewardPoolFunded(amount, block.timestamp);
    }
    
    /// @notice Authorize a contract to mint rewards
    function authorizeRewardSource(address source, bool authorized) external onlyOwner {
        authorizedRewardSources[source] = authorized;
    }
    
    /// @notice Get staking info for a user
    function getStakeInfo(address user) external view returns (
        uint256 amount,
        uint256 stakedAt,
        uint256 pendingReward,
        bool active,
        uint256 unlockTime
    ) {
        Stake storage s = stakes[user];
        return (
            s.amount,
            s.stakedAt,
            calculateReward(user) + s.rewardDebt,
            s.active,
            s.stakedAt + LOCK_PERIOD
        );
    }
    
    /// @notice Get total staked and reward pool
    function getPoolInfo() external view returns (
        uint256 _totalStaked,
        uint256 _rewardPool,
        uint256 _rewardRate
    ) {
        return (totalStaked, rewardPool, REWARD_RATE);
    }
}

interface IJGTToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function mint(address to, uint256 amount) external returns (bool);
}
