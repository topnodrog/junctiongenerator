// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title JGT Token
/// @notice Junction Generator Token - ERC-20 on Base network
/// @dev Used for attention mining rewards, staking, and platform governance
contract JGTToken is ERC20, ERC20Burnable, Ownable, ReentrancyGuard {
    
    /// @notice Maximum supply: 1 billion JGT
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18;
    
    /// @notice Tokens allocated to the batch dispenser for reward distribution
    address public dispenser;
    
    /// @notice Staking contract address
    address public staking;
    
    /// @notice Mapping of authorized minters (dispenser, staking, etc.)
    mapping(address => bool) public authorizedMinters;
    
    event MinterAuthorized(address indexed minter, bool authorized);
    event DispenserUpdated(address indexed oldDispenser, address indexed newDispenser);
    event StakingUpdated(address indexed oldStaking, address indexed newStaking);
    
    error ExceedsMaxSupply(uint256 attempted, uint256 remaining);
    error NotAuthorizedMinter(address caller);
    error InvalidAddress();
    
    constructor(address _owner) ERC20("Junction Generator Token", "JGT") Ownable(_owner) {
        // Mint initial supply to the owner
        // 100M for ecosystem/rewards, 50M for team (vested), 850M reserved
        uint256 initialMint = 100_000_000 * 10**18;
        _mint(_owner, initialMint);
    }
    
    /// @notice Authorize or revoke a minter (dispenser, staking contract, etc.)
    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        if (minter == address(0)) revert InvalidAddress();
        authorizedMinters[minter] = authorized;
        emit MinterAuthorized(minter, authorized);
    }
    
    /// @notice Set the batch dispenser contract
    function setDispenser(address _dispenser) external onlyOwner {
        if (_dispenser == address(0)) revert InvalidAddress();
        address old = dispenser;
        dispenser = _dispenser;
        authorizedMinters[_dispenser] = true;
        emit DispenserUpdated(old, _dispenser);
        emit MinterAuthorized(_dispenser, true);
    }
    
    /// @notice Set the staking contract
    function setStaking(address _staking) external onlyOwner {
        if (_staking == address(0)) revert InvalidAddress();
        address old = staking;
        staking = _staking;
        authorizedMinters[_staking] = true;
        emit StakingUpdated(old, _staking);
        emit MinterAuthorized(_staking, true);
    }
    
    /// @notice Mint tokens (only authorized minters)
    function mint(address to, uint256 amount) external nonReentrant {
        if (!authorizedMinters[msg.sender]) revert NotAuthorizedMinter(msg.sender);
        if (totalSupply() + amount > MAX_SUPPLY) {
            revert ExceedsMaxSupply(amount, MAX_SUPPLY - totalSupply());
        }
        _mint(to, amount);
    }
    
    /// @notice Batch mint for reward distribution (only dispenser)
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external nonReentrant {
        if (msg.sender != dispenser) revert NotAuthorizedMinter(msg.sender);
        uint256 len = recipients.length;
        if (len == 0 || len != amounts.length) revert InvalidAddress();
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < len; i++) {
            totalAmount += amounts[i];
        }
        if (totalSupply() + totalAmount > MAX_SUPPLY) {
            revert ExceedsMaxSupply(totalAmount, MAX_SUPPLY - totalSupply());
        }
        
        for (uint256 i = 0; i < len; i++) {
            _mint(recipients[i], amounts[i]);
        }
    }
    
    /// @notice Get remaining mintable supply
    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }
}
