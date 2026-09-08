// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title WispAssetRegistry
/// @notice Onchain source of truth for assets accepted by escrow/router.
contract WispAssetRegistry is Ownable {
    struct AssetConfig {
        bool enabled;
        uint8 decimals;
        uint64 usdPriceE6;
        bytes32 assetKey;
    }

    mapping(address => AssetConfig) private _assets;

    event AssetConfigured(
        address indexed token, bytes32 indexed assetKey, bool enabled, uint8 decimals, uint64 usdPriceE6
    );

    error ZeroToken();
    error ZeroPrice();
    error ZeroAssetKey();
    error DecimalsTooHigh(uint8 decimals);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setAsset(address token, AssetConfig calldata config) external onlyOwner {
        if (token == address(0)) revert ZeroToken();
        if (config.usdPriceE6 == 0) revert ZeroPrice();
        if (config.assetKey == bytes32(0)) revert ZeroAssetKey();
        if (config.decimals > 18) revert DecimalsTooHigh(config.decimals);

        _assets[token] = config;
        emit AssetConfigured(token, config.assetKey, config.enabled, config.decimals, config.usdPriceE6);
    }

    function getAsset(address token) external view returns (AssetConfig memory) {
        return _assets[token];
    }

    function isEnabled(address token) external view returns (bool) {
        return _assets[token].enabled;
    }

    /// @notice Treats `usdcAmount` as six-decimal USDC; returns raw stock units.
    function quoteStockAmount(address token, uint256 usdcAmount) external view returns (uint256) {
        AssetConfig memory cfg = _assets[token];
        if (!cfg.enabled || cfg.usdPriceE6 == 0) return 0;
        // stock = usdcAmount * 10^decimals / usdPriceE6
        return Math.mulDiv(usdcAmount, 10 ** uint256(cfg.decimals), uint256(cfg.usdPriceE6));
    }
}
