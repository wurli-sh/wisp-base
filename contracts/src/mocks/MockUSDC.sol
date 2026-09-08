// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title MockUSDC
/// @notice Sepolia-only test USDC with a capped public faucet. Never use on mainnet.
contract MockUSDC is ERC20Permit {
    uint256 public constant FAUCET_MAX = 1_000e6;
    uint64 public constant FAUCET_COOLDOWN = 1 hours;

    mapping(address => uint64) public lastFaucetAt;

    event FaucetMinted(address indexed to, uint256 amount);

    error FaucetAmountTooHigh(uint256 amount, uint256 maxAmount);
    error FaucetCooldownActive(uint64 readyAt);
    error FaucetZeroAddress();

    constructor() ERC20("Wisp Test USDC", "tUSDC") ERC20Permit("Wisp Test USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucetMax() external pure returns (uint256) {
        return FAUCET_MAX;
    }

    /// @notice Earliest timestamp when `account` may faucet again (0 if never used).
    function faucetCooldown(address account) external view returns (uint64 readyAt) {
        uint64 last = lastFaucetAt[account];
        if (last == 0) return 0;
        return last + FAUCET_COOLDOWN;
    }

    /// @notice Anyone may call. Tokens always mint to `to`.
    function faucet(address to, uint256 amount) external {
        if (to == address(0)) revert FaucetZeroAddress();
        if (amount == 0 || amount > FAUCET_MAX) revert FaucetAmountTooHigh(amount, FAUCET_MAX);

        uint64 readyAt = lastFaucetAt[to] == 0 ? 0 : lastFaucetAt[to] + FAUCET_COOLDOWN;
        if (readyAt != 0 && block.timestamp < readyAt) revert FaucetCooldownActive(readyAt);

        lastFaucetAt[to] = uint64(block.timestamp);
        _mint(to, amount);
        emit FaucetMinted(to, amount);
    }
}
