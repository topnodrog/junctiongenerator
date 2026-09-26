// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title JGTClaimDispenser
/// @notice A JGT faucet with a two-token-per-day accrual per wallet.
/// @dev The contract has no owner or withdrawal function. It can mint only after
///      the JGT token's current owner authorizes it as a minter. Claims are
///      permissionless; the transaction sender pays Base gas. A wallet may also
///      authorize a named relayer with an EIP-712 signature.
interface IJGTClaimToken {
    function decimals() external view returns (uint8);
    function remainingSupply() external view returns (uint256);
    function mint(address to, uint256 amount) external returns (bool);
}

interface IJGTClaimSignatureValidator {
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
}

contract JGTClaimDispenser {
    uint256 public constant CLAIM_INTERVAL = 1 days;
    uint256 public constant CLAIM_AMOUNT = 2 ether;

    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant CLAIM_TYPEHASH = keccak256(
        "Claim(address account,uint256 amount,uint256 nonce,uint256 deadline,address relayer)"
    );
    bytes32 private constant NAME_HASH = keccak256("JGTClaimDispenser");
    bytes32 private constant VERSION_HASH = keccak256("1");
    bytes4 private constant EIP1271_MAGIC_VALUE = 0x1626ba7e;
    uint256 private constant SECP256K1_HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public immutable token;
    /// @notice Supply available when deployed; this faucet can never mint more than this cap.
    uint256 public immutable mintCap;
    uint256 public totalFaucetMinted;

    /// @notice Timestamp through which this account's completed daily periods were paid.
    /// @dev A zero value means the account can claim its first 2 JGT immediately.
    mapping(address account => uint256 timestamp) public lastClaimAt;

    /// @notice EIP-712 nonce; incremented for direct and relayed claims alike.
    mapping(address account => uint256 nonce) public nonces;

    uint256 private _entered;

    event Claimed(
        address indexed account,
        address indexed relayer,
        uint256 amount,
        uint256 dailyPeriods,
        uint256 newLastClaimAt
    );

    error InvalidToken();
    error NoRemainingSupply();
    error InvalidAccount();
    error InvalidAmount();
    error NothingAccrued();
    error FaucetEmpty();
    error InsufficientRemainingSupply();
    error MintFailed();
    error ExpiredAuthorization();
    error WrongRelayer();
    error InvalidSignature();
    error ReentrantCall();

    modifier nonReentrant() {
        if (_entered != 0) revert ReentrantCall();
        _entered = 1;
        _;
        _entered = 0;
    }

    /// @param tokenAddress Existing 18-decimal JGT ERC-20 address.
    constructor(address tokenAddress) {
        if (tokenAddress == address(0) || tokenAddress.code.length == 0) revert InvalidToken();
        uint8 tokenDecimals;
        try IJGTClaimToken(tokenAddress).decimals() returns (uint8 actualDecimals) {
            tokenDecimals = actualDecimals;
        } catch {
            revert InvalidToken();
        }
        if (tokenDecimals != 18) revert InvalidToken();
        uint256 supplyAvailable;
        try IJGTClaimToken(tokenAddress).remainingSupply() returns (uint256 amount) {
            supplyAvailable = amount;
        } catch {
            revert InvalidToken();
        }
        if (supplyAvailable == 0) revert NoRemainingSupply();
        token = tokenAddress;
        mintCap = supplyAvailable;
    }

    /// @notice Whole JGT accrued since the first successful claim or the last paid period.
    /// @dev The first claim is immediately eligible for 2 JGT; after that, 2 accrue
    ///      for each completed 24-hour period. Merely viewing the page is not recorded.
    function accrued(address account) public view returns (uint256) {
        if (account == address(0)) revert InvalidAccount();
        uint256 previousClaim = lastClaimAt[account];
        if (previousClaim == 0) return CLAIM_AMOUNT;
        return ((block.timestamp - previousClaim) / CLAIM_INTERVAL) * CLAIM_AMOUNT;
    }

    /// @notice Remaining faucet allotment, also limited by the token's global max supply.
    function remainingFaucetSupply() public view returns (uint256) {
        uint256 capLeft = mintCap - totalFaucetMinted;
        uint256 tokenSupplyLeft = IJGTClaimToken(token).remainingSupply();
        return capLeft < tokenSupplyLeft ? capLeft : tokenSupplyLeft;
    }

    /// @notice Accrued amount currently payable, limited by this faucet's remaining allotment.
    function claimable(address account) public view returns (uint256) {
        uint256 waiting = accrued(account);
        uint256 available = (remainingFaucetSupply() / CLAIM_AMOUNT) * CLAIM_AMOUNT;
        return waiting < available ? waiting : available;
    }

    /// @notice Claim all currently payable JGT for the caller. The caller pays network gas.
    function claim() external nonReentrant returns (uint256 amount) {
        uint256 waiting = accrued(msg.sender);
        uint256 remaining = remainingFaucetSupply();
        uint256 available = (remaining / CLAIM_AMOUNT) * CLAIM_AMOUNT;
        amount = waiting < available ? waiting : available;
        if (amount == 0) {
            if (remaining < CLAIM_AMOUNT) revert FaucetEmpty();
            revert NothingAccrued();
        }
        _settle(msg.sender, msg.sender, amount);
    }

    /// @notice Claim for an account using its EIP-712 signature; msg.sender pays the gas.
    /// @param account Wallet that signed the authorization and receives the JGT.
    /// @param amount Exact whole-JGT amount the account authorized.
    /// @param deadline Unix timestamp after which the authorization expires.
    /// @param relayer The only address allowed to submit this claim, or address(0) for any relayer.
    /// @param signature EIP-712 signature for Claim(account, amount, nonce, deadline, relayer).
    function claimWithSig(
        address account,
        uint256 amount,
        uint256 deadline,
        address relayer,
        bytes calldata signature
    ) external nonReentrant returns (uint256) {
        if (account == address(0)) revert InvalidAccount();
        if (block.timestamp > deadline) revert ExpiredAuthorization();
        if (relayer != address(0) && relayer != msg.sender) revert WrongRelayer();
        if (amount == 0 || amount % CLAIM_AMOUNT != 0) revert InvalidAmount();
        if (amount > accrued(account)) revert NothingAccrued();
        if (amount > remainingFaucetSupply()) revert InsufficientRemainingSupply();

        bytes32 structHash = keccak256(
            abi.encode(CLAIM_TYPEHASH, account, amount, nonces[account], deadline, relayer)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        if (!_isValidSigner(account, digest, signature)) revert InvalidSignature();

        _settle(account, msg.sender, amount);
        return amount;
    }

    /// @notice EIP-712 domain for off-chain claim signatures.
    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))
        );
    }

    function _settle(address account, address relayer, uint256 amount) private {
        if (amount == 0 || amount % CLAIM_AMOUNT != 0 || amount > accrued(account)) {
            revert InvalidAmount();
        }
        if (amount > remainingFaucetSupply()) revert InsufficientRemainingSupply();

        uint256 periods = amount / CLAIM_AMOUNT;
        totalFaucetMinted += amount;
        uint256 previousClaim = lastClaimAt[account];
        lastClaimAt[account] = previousClaim == 0
            ? block.timestamp
            : previousClaim + periods * CLAIM_INTERVAL;
        nonces[account] += 1;

        (bool success, bytes memory result) = token.call(
            abi.encodeWithSelector(IJGTClaimToken.mint.selector, account, amount)
        );
        if (!success || result.length == 0 || !abi.decode(result, (bool))) {
            revert MintFailed();
        }

        emit Claimed(account, relayer, amount, periods, lastClaimAt[account]);
    }

    function _isValidSigner(address signer, bytes32 digest, bytes calldata signature) private view returns (bool) {
        if (signer.code.length == 0) return _recover(digest, signature) == signer;
        try IJGTClaimSignatureValidator(signer).isValidSignature(digest, signature) returns (bytes4 magicValue) {
            return magicValue == EIP1271_MAGIC_VALUE;
        } catch {
            return false;
        }
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > SECP256K1_HALF_ORDER || (v != 27 && v != 28)) {
            revert InvalidSignature();
        }
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
