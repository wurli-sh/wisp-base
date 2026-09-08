// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {WispGiftEscrow} from "../../src/WispGiftEscrow.sol";

/// @dev Reentrant ERC20 that attempts to double-claim/refund on transfer.
contract ReentrantToken is ERC20 {
    WispGiftEscrow public escrow;
    uint256 public giftId;
    address public recipient;
    uint64 public deadline;
    bytes public authorization;
    bool public attackClaim;
    bool public attackRefund;
    bool private _entered;

    constructor() ERC20("Reentrant", "RNT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function configureAttack(
        WispGiftEscrow escrow_,
        uint256 giftId_,
        address recipient_,
        uint64 deadline_,
        bytes calldata authorization_,
        bool claim_,
        bool refund_
    ) external {
        escrow = escrow_;
        giftId = giftId_;
        recipient = recipient_;
        deadline = deadline_;
        authorization = authorization_;
        attackClaim = claim_;
        attackRefund = refund_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (_entered || address(escrow) == address(0)) return;
        if (from != address(escrow)) return;
        _entered = true;
        if (attackClaim) {
            try escrow.claim(giftId, recipient, deadline, authorization) {} catch {}
        }
        if (attackRefund) {
            try escrow.refund(giftId) {} catch {}
        }
        _entered = false;
    }
}
