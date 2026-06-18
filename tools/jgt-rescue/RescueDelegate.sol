// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IOwnable {
    function transferOwnership(address newOwner) external;
}

/// @title RescueDelegate
/// @notice One-shot rescue logic intended to be installed on a *compromised* EOA
///         via an EIP-7702 authorization, then immediately invoked in the same
///         sponsored transaction.
///
/// How it runs: a clean "sponsor" wallet sends a type-4 transaction that (1) carries
/// an authorization — signed off-chain by the compromised key — delegating the
/// compromised account's code to THIS contract, and (2) calls `rescue(...)` on the
/// compromised account. Because of the delegation, this code executes *in the
/// compromised account's context*: `address(this)` is the compromised wallet, and
/// the inner calls to the token have `msg.sender == the compromised wallet`.
///
/// The compromised wallet therefore never needs ETH for gas — the sponsor pays. This
/// sidesteps the attacker's sweeper, which only drains ETH the moment it lands.
contract RescueDelegate {
    /// @param token The ERC-20 (JGT) whose balance/ownership we are rescuing.
    /// @param safe  The clean destination wallet that should receive everything.
    function rescue(address token, address safe) external {
        // 1) Move the full token balance out of the compromised account.
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) {
            require(IERC20(token).transfer(safe, bal), "token transfer failed");
        }

        // 2) Best-effort: hand token ownership to the safe wallet so the leaked
        //    key can no longer mint. If address(this) is not the owner this will
        //    revert internally; the try/catch keeps the token transfer (step 1)
        //    intact regardless.
        try IOwnable(token).transferOwnership(safe) {} catch {}
    }
}
