// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Fee-on-transfer token used to assert escrow rejection.
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && value > 0) {
            uint256 fee = value / 100;
            uint256 send = value - fee;
            super._update(from, to, send);
            if (fee > 0) {
                super._update(from, address(0xdead), fee);
            }
            return;
        }
        super._update(from, to, value);
    }
}
