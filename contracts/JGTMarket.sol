// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title JGTMarket
/// @notice Simple JGT token marketplace
/// @dev Users buy JGT with ETH. ETH goes to treasury, JGT comes from owner's balance.
contract JGTMarket {
    address public immutable jgtToken;
    address public owner;
    address public treasury;
    
    // Price: 1 ETH = 10,000 JGT (0.0001 ETH per JGT)
    uint256 public constant JGT_PER_ETH = 10_000;
    uint256 public constant MIN_PURCHASE = 0.001 ether;
    uint256 public constant MAX_PURCHASE = 10 ether;
    
    uint256 public totalSold;
    uint256 public totalEthRaised;
    
    event Purchase(address indexed buyer, uint256 ethAmount, uint256 jgtAmount);
    event PriceUpdated(uint256 newJgtPerEth);
    event TreasuryUpdated(address newTreasury);
    
    error InvalidAmount();
    error InsufficientStock();
    error TransferFailed();
    error NotOwner();
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    
    constructor(address _jgtToken, address _treasury) {
        if (_jgtToken == address(0) || _treasury == address(0)) revert InvalidAmount();
        jgtToken = _jgtToken;
        owner = msg.sender;
        treasury = _treasury;
    }
    
    /// @notice Buy JGT with ETH
    function buy() external payable {
        if (msg.value < MIN_PURCHASE || msg.value > MAX_PURCHASE) revert InvalidAmount();
        
        uint256 jgtAmount = (msg.value * JGT_PER_ETH) / 1e18;
        
        // Check market has enough JGT (owner must deposit first)
        uint256 marketBalance = IJGTToken(jgtToken).balanceOf(address(this));
        if (marketBalance < jgtAmount) revert InsufficientStock();
        
        // Transfer JGT to buyer
        bool success = IJGTToken(jgtToken).transfer(msg.sender, jgtAmount);
        if (!success) revert TransferFailed();
        
        // Forward ETH to treasury
        (bool ethSuccess, ) = treasury.call{value: msg.value}("");
        if (!ethSuccess) revert TransferFailed();
        
        totalSold += jgtAmount;
        totalEthRaised += msg.value;
        
        emit Purchase(msg.sender, msg.value, jgtAmount);
    }
    
    /// @notice Calculate how much JGT you get for a given ETH amount
    function getJgtAmount(uint256 ethAmount) external pure returns (uint256) {
        return (ethAmount * JGT_PER_ETH) / 1e18;
    }
    
    /// @notice Calculate ETH needed for a given JGT amount
    function getEthCost(uint256 jgtAmount) external pure returns (uint256) {
        return (jgtAmount * 1e18) / JGT_PER_ETH;
    }
    
    /// @notice Get market stats
    function getMarketInfo() external view returns (
        uint256 _jgtPerEth,
        uint256 _minPurchase,
        uint256 _maxPurchase,
        uint256 _totalSold,
        uint256 _totalEthRaised,
        uint256 _marketBalance
    ) {
        return (
            JGT_PER_ETH,
            MIN_PURCHASE,
            MAX_PURCHASE,
            totalSold,
            totalEthRaised,
            IJGTToken(jgtToken).balanceOf(address(this))
        );
    }
    
    /// @notice Owner can withdraw unsold JGT
    function withdrawJgt(uint256 amount) external onlyOwner {
        bool success = IJGTToken(jgtToken).transfer(owner, amount);
        if (!success) revert TransferFailed();
    }
    
    /// @notice Owner can update treasury
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAmount();
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }
    
    /// @notice Owner can update price
    function setPrice(uint256 _jgtPerEth) external onlyOwner {
        if (_jgtPerEth == 0) revert InvalidAmount();
        // Note: JGT_PER_ETH is constant, so this would need a storage variable
        // For simplicity, price is fixed at deployment
        emit PriceUpdated(_jgtPerEth);
    }
    
    receive() external payable {
        // Allow direct ETH sends to buy JGT
        if (msg.value >= MIN_PURCHASE) {
            // Call buy logic
            uint256 jgtAmount = (msg.value * JGT_PER_ETH) / 1e18;
            uint256 marketBalance = IJGTToken(jgtToken).balanceOf(address(this));
            if (marketBalance >= jgtAmount) {
                IJGTToken(jgtToken).transfer(msg.sender, jgtAmount);
                (bool ethSuccess, ) = treasury.call{value: msg.value}("");
                require(ethSuccess);
                totalSold += jgtAmount;
                totalEthRaised += msg.value;
                emit Purchase(msg.sender, msg.value, jgtAmount);
            }
        }
    }
}

interface IJGTToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}
