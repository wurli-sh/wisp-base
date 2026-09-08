// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {WispAssetRegistry} from "./WispAssetRegistry.sol";
import {WispGiftEscrow} from "./WispGiftEscrow.sol";

/// @title WispDemoStockRouter
/// @notice Fixed-price Sepolia demo router: pay tUSDC, gift stock from pre-seeded inventory.
contract WispDemoStockRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable mockUsdc;
    WispAssetRegistry public immutable registry;
    WispGiftEscrow public immutable escrow;
    address public immutable treasury;

    event StockGiftPurchased(
        uint256 indexed giftId, address indexed sender, address indexed stock, uint256 usdcAmount, uint256 stockAmount
    );

    error ZeroAddress();
    error ZeroUsdcAmount();
    error StockNotEnabled();
    error QuoteBelowMinimum(uint256 quoted, uint256 minimum);
    error InsufficientInventory(uint256 available, uint256 needed);

    constructor(address mockUsdc_, address registry_, address escrow_, address treasury_) {
        if (mockUsdc_ == address(0) || registry_ == address(0) || escrow_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        mockUsdc = IERC20(mockUsdc_);
        registry = WispAssetRegistry(registry_);
        escrow = WispGiftEscrow(escrow_);
        treasury = treasury_;
    }

    function buyAndGift(address stock, uint256 usdcAmount, uint256 minStockAmount, uint64 unlockAt, uint64 expiresAt)
        external
        nonReentrant
        returns (uint256 giftId, uint256 stockAmount)
    {
        return _buyAndGift(stock, usdcAmount, minStockAmount, unlockAt, expiresAt);
    }

    function buyAndGiftWithPermit(
        address stock,
        uint256 usdcAmount,
        uint256 minStockAmount,
        uint64 unlockAt,
        uint64 expiresAt,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 giftId, uint256 stockAmount) {
        IERC20Permit(address(mockUsdc)).permit(msg.sender, address(this), usdcAmount, permitDeadline, v, r, s);
        return _buyAndGift(stock, usdcAmount, minStockAmount, unlockAt, expiresAt);
    }

    function _buyAndGift(address stock, uint256 usdcAmount, uint256 minStockAmount, uint64 unlockAt, uint64 expiresAt)
        internal
        returns (uint256 giftId, uint256 stockAmount)
    {
        if (usdcAmount == 0) revert ZeroUsdcAmount();
        if (!registry.isEnabled(stock)) revert StockNotEnabled();

        stockAmount = registry.quoteStockAmount(stock, usdcAmount);
        if (stockAmount < minStockAmount) revert QuoteBelowMinimum(stockAmount, minStockAmount);

        uint256 available = IERC20(stock).balanceOf(address(this));
        if (available < stockAmount) revert InsufficientInventory(available, stockAmount);

        mockUsdc.safeTransferFrom(msg.sender, treasury, usdcAmount);
        IERC20(stock).safeTransfer(address(escrow), stockAmount);
        giftId = escrow.registerPrefundedGift(msg.sender, stock, stockAmount, unlockAt, expiresAt);

        emit StockGiftPurchased(giftId, msg.sender, stock, usdcAmount, stockAmount);
    }
}
