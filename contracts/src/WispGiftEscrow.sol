// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {WispAssetRegistry} from "./WispAssetRegistry.sol";

/// @title WispGiftEscrow
/// @notice Escrows gifted stock tokens with EIP-712 claim authorization.
contract WispGiftEscrow is Ownable, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    enum GiftStatus {
        None,
        Funded,
        Claimed,
        Refunded
    }

    struct Gift {
        address token;
        address sender;
        uint128 amount;
        uint64 unlockAt;
        uint64 expiresAt;
        GiftStatus status;
    }

    bytes32 public constant CLAIM_AUTHORIZATION_TYPEHASH =
        keccak256("ClaimAuthorization(uint256 giftId,address recipient,uint64 deadline)");

    uint64 public constant MAX_GIFT_DURATION = 30 days;

    WispAssetRegistry public immutable registry;

    address public claimSigner;
    address public demoRouter;
    uint256 public nextGiftId = 1;

    mapping(uint256 => Gift) private _gifts;
    mapping(address => uint256) public lockedByToken;

    event GiftCreated(
        uint256 indexed giftId,
        address indexed sender,
        address indexed token,
        uint256 amount,
        uint64 unlockAt,
        uint64 expiresAt
    );
    event GiftClaimed(uint256 indexed giftId, address indexed recipient);
    event GiftRefunded(uint256 indexed giftId, address indexed sender);
    event ClaimSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event RouterUpdated(address indexed previousRouter, address indexed newRouter);
    event SurplusRescued(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error AmountTooLarge();
    error TokenNotEnabled();
    error InvalidTimestamps();
    error ExpiryTooFar();
    error NotDemoRouter();
    error Undercollateralized();
    error FeeOnTransferUnsupported();
    error GiftNotFunded();
    error GiftLocked();
    error GiftExpired();
    error GiftNotExpired();
    error NotSender();
    error InvalidAuthorization();
    error AuthorizationExpired();
    error NothingToRescue();

    constructor(address initialOwner, address registry_, address claimSigner_)
        Ownable(initialOwner)
        EIP712("WispGiftEscrow", "1")
    {
        if (registry_ == address(0) || claimSigner_ == address(0)) revert ZeroAddress();
        registry = WispAssetRegistry(registry_);
        claimSigner = claimSigner_;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setClaimSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        address previous = claimSigner;
        claimSigner = newSigner;
        emit ClaimSignerUpdated(previous, newSigner);
    }

    function setDemoRouter(address newRouter) external onlyOwner {
        address previous = demoRouter;
        demoRouter = newRouter;
        emit RouterUpdated(previous, newRouter);
    }

    function createGift(address token, uint256 amount, uint64 unlockAt, uint64 expiresAt)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 giftId)
    {
        _validateFundingParams(token, amount, unlockAt, expiresAt);

        uint256 beforeBal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - beforeBal;
        if (received != amount) revert FeeOnTransferUnsupported();

        giftId = _storeGift(msg.sender, token, amount, unlockAt, expiresAt);
    }

    function registerPrefundedGift(address sender, address token, uint256 amount, uint64 unlockAt, uint64 expiresAt)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 giftId)
    {
        if (msg.sender != demoRouter) revert NotDemoRouter();
        if (sender == address(0)) revert ZeroAddress();
        _validateFundingParams(token, amount, unlockAt, expiresAt);

        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal < lockedByToken[token] + amount) revert Undercollateralized();

        giftId = _storeGift(sender, token, amount, unlockAt, expiresAt);
    }

    function claim(uint256 giftId, address recipient, uint64 authorizationDeadline, bytes calldata authorization)
        external
        whenNotPaused
        nonReentrant
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (block.timestamp > authorizationDeadline) revert AuthorizationExpired();

        Gift storage g = _gifts[giftId];
        if (g.status != GiftStatus.Funded) revert GiftNotFunded();
        if (block.timestamp < g.unlockAt) revert GiftLocked();
        if (block.timestamp >= g.expiresAt) revert GiftExpired();

        bytes32 digest = claimAuthorizationDigest(giftId, recipient, authorizationDeadline);
        address recovered = ECDSA.recover(digest, authorization);
        if (recovered != claimSigner) revert InvalidAuthorization();

        g.status = GiftStatus.Claimed;
        lockedByToken[g.token] -= g.amount;

        IERC20(g.token).safeTransfer(recipient, g.amount);
        emit GiftClaimed(giftId, recipient);
    }

    function refund(uint256 giftId) external nonReentrant {
        Gift storage g = _gifts[giftId];
        if (g.status != GiftStatus.Funded) revert GiftNotFunded();
        if (msg.sender != g.sender) revert NotSender();
        if (block.timestamp < g.expiresAt) revert GiftNotExpired();

        g.status = GiftStatus.Refunded;
        lockedByToken[g.token] -= g.amount;

        IERC20(g.token).safeTransfer(g.sender, g.amount);
        emit GiftRefunded(giftId, g.sender);
    }

    function rescueSurplus(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = IERC20(token).balanceOf(address(this));
        uint256 locked = lockedByToken[token];
        if (bal <= locked) revert NothingToRescue();
        uint256 surplus = bal - locked;
        if (amount == 0 || amount > surplus) revert NothingToRescue();
        IERC20(token).safeTransfer(to, amount);
        emit SurplusRescued(token, to, amount);
    }

    function getGift(uint256 giftId) external view returns (Gift memory) {
        return _gifts[giftId];
    }

    function claimAuthorizationDigest(uint256 giftId, address recipient, uint64 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(CLAIM_AUTHORIZATION_TYPEHASH, giftId, recipient, deadline)));
    }

    function _validateFundingParams(address token, uint256 amount, uint64 unlockAt, uint64 expiresAt) internal view {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > type(uint128).max) revert AmountTooLarge();
        if (!registry.isEnabled(token)) revert TokenNotEnabled();
        if (unlockAt >= expiresAt) revert InvalidTimestamps();
        if (expiresAt <= block.timestamp) revert InvalidTimestamps();
        if (expiresAt > block.timestamp + MAX_GIFT_DURATION) revert ExpiryTooFar();
    }

    function _storeGift(address sender, address token, uint256 amount, uint64 unlockAt, uint64 expiresAt)
        internal
        returns (uint256 giftId)
    {
        giftId = nextGiftId++;
        _gifts[giftId] = Gift({
            token: token,
            sender: sender,
            amount: uint128(amount),
            unlockAt: unlockAt,
            expiresAt: expiresAt,
            status: GiftStatus.Funded
        });
        lockedByToken[token] += amount;
        emit GiftCreated(giftId, sender, token, amount, unlockAt, expiresAt);
    }
}
