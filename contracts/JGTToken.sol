// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title JGT Token
/// @notice Junction Generator Token - ERC-20 on Base network
/// @dev Self-contained, no OpenZeppelin dependencies
contract JGTToken {
    // Token metadata
    string public constant name = "Junction Generator Token";
    string public constant symbol = "JGT";
    uint8 public constant decimals = 18;
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18;

    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public authorizedMinters;

    // Events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MinterAuthorized(address indexed minter, bool authorized);

    // Errors
    error InsufficientBalance();
    error InsufficientAllowance();
    error ExceedsMaxSupply();
    error NotAuthorizedMinter();
    error InvalidAddress();
    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        // Mint initial supply: 100M JGT to deployer
        uint256 initialMint = 100_000_000 * 10**18;
        _mint(msg.sender, initialMint);
    }

    // ============================================================
    // ERC-20 FUNCTIONS
    // ============================================================

    function transfer(address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert InvalidAddress();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;

        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) revert InvalidAddress();

        allowance[msg.sender][spender] = amount;

        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert InvalidAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        if (allowance[from][msg.sender] < amount) revert InsufficientAllowance();

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;

        emit Transfer(from, to, amount);
        return true;
    }

    // ============================================================
    // MINTING (Owner + Authorized Minters)
    // ============================================================

    function authorizeMinter(address minter, bool authorized) external onlyOwner {
        if (minter == address(0)) revert InvalidAddress();
        authorizedMinters[minter] = authorized;
        emit MinterAuthorized(minter, authorized);
    }

    function mint(address to, uint256 amount) external returns (bool) {
        if (msg.sender != owner && !authorizedMinters[msg.sender]) revert NotAuthorizedMinter();
        if (to == address(0)) revert InvalidAddress();
        _mint(to, amount);
        return true;
    }

    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external {
        if (msg.sender != owner && !authorizedMinters[msg.sender]) revert NotAuthorizedMinter();
        if (recipients.length == 0 || recipients.length != amounts.length) revert InvalidAddress();

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        if (totalSupply + totalAmount > MAX_SUPPLY) revert ExceedsMaxSupply();

        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert InvalidAddress();
            _mint(recipients[i], amounts[i]);
        }
    }

    function _mint(address to, uint256 amount) internal {
        if (totalSupply + amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    // ============================================================
    // BURN
    // ============================================================

    function burn(uint256 amount) external {
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    // ============================================================
    // OWNERSHIP
    // ============================================================

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    // ============================================================
    // VIEW FUNCTIONS
    // ============================================================

    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply;
    }
}
