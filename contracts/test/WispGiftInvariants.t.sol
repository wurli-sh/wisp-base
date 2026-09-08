// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {WispAssetRegistry} from "../src/WispAssetRegistry.sol";
import {WispGiftEscrow} from "../src/WispGiftEscrow.sol";
import {MockStock} from "./helpers/MockStock.sol";

contract GiftHandler is Test {
    WispGiftEscrow public escrow;
    MockStock public stock;
    address public claimSigner;
    uint256 public claimSignerPk;

    address[] public actors;
    uint256 public funded;
    uint256 public claimed;
    uint256 public refunded;

    constructor(WispGiftEscrow escrow_, MockStock stock_, address claimSigner_, uint256 claimSignerPk_) {
        escrow = escrow_;
        stock = stock_;
        claimSigner = claimSigner_;
        claimSignerPk = claimSignerPk_;
        actors.push(makeAddr("a1"));
        actors.push(makeAddr("a2"));
        actors.push(makeAddr("a3"));
        for (uint256 i = 0; i < actors.length; i++) {
            stock.mint(actors[i], 1_000_000 ether);
        }
    }

    function create(uint256 actorSeed, uint256 amountSeed) external {
        address actor = actors[actorSeed % actors.length];
        uint256 amount = bound(amountSeed, 1 ether, 100 ether);
        uint64 unlockAt = uint64(block.timestamp);
        uint64 expiresAt = uint64(block.timestamp + 7 days);

        vm.startPrank(actor);
        stock.approve(address(escrow), amount);
        escrow.createGift(address(stock), amount, unlockAt, expiresAt);
        vm.stopPrank();
        funded += amount;
    }

    function claimGift(uint256 giftSeed, uint256 actorSeed) external {
        uint256 nextId = escrow.nextGiftId();
        if (nextId <= 1) return;
        uint256 giftId = 1 + (giftSeed % (nextId - 1));
        WispGiftEscrow.Gift memory g = escrow.getGift(giftId);
        if (g.status != WispGiftEscrow.GiftStatus.Funded) return;
        if (block.timestamp < g.unlockAt || block.timestamp >= g.expiresAt) return;

        address to = actors[actorSeed % actors.length];
        uint64 deadline = uint64(block.timestamp + 1 days);
        bytes32 digest = escrow.claimAuthorizationDigest(giftId, to, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(claimSignerPk, digest);

        uint256 beforeBal = stock.balanceOf(to);
        escrow.claim(giftId, to, deadline, abi.encodePacked(r, s, v));
        assertEq(stock.balanceOf(to), beforeBal + g.amount);
        claimed += g.amount;
    }

    function refundGift(uint256 giftSeed) external {
        uint256 nextId = escrow.nextGiftId();
        if (nextId <= 1) return;
        uint256 giftId = 1 + (giftSeed % (nextId - 1));
        WispGiftEscrow.Gift memory g = escrow.getGift(giftId);
        if (g.status != WispGiftEscrow.GiftStatus.Funded) return;
        if (block.timestamp < g.expiresAt) {
            vm.warp(g.expiresAt);
        }
        vm.prank(g.sender);
        escrow.refund(giftId);
        refunded += g.amount;
    }

    function warpTime(uint256 delta) external {
        vm.warp(block.timestamp + bound(delta, 1, 3 days));
    }
}

contract WispGiftInvariants is StdInvariant, Test {
    WispGiftEscrow internal escrow;
    MockStock internal stock;
    GiftHandler internal handler;
    WispAssetRegistry internal registry;

    function setUp() public {
        address owner = makeAddr("owner");
        (address claimSigner, uint256 claimSignerPk) = makeAddrAndKey("claimSigner");

        vm.startPrank(owner);
        registry = new WispAssetRegistry(owner);
        escrow = new WispGiftEscrow(owner, address(registry), claimSigner);
        stock = new MockStock("Wisp Test Apple", "wAAPL", 18);
        registry.setAsset(
            address(stock),
            WispAssetRegistry.AssetConfig({
                enabled: true, decimals: 18, usdPriceE6: 316_000_000, assetKey: keccak256("WISPAAPL")
            })
        );
        vm.stopPrank();

        handler = new GiftHandler(escrow, stock, claimSigner, claimSignerPk);
        targetContract(address(handler));
    }

    function invariant_balanceCoversLocked() public view {
        assertGe(stock.balanceOf(address(escrow)), escrow.lockedByToken(address(stock)));
    }

    function invariant_accounting() public view {
        assertEq(handler.claimed() + handler.refunded() + escrow.lockedByToken(address(stock)), handler.funded());
    }

    function invariant_terminalOnce() public view {
        uint256 nextId = escrow.nextGiftId();
        for (uint256 id = 1; id < nextId; id++) {
            WispGiftEscrow.Gift memory g = escrow.getGift(id);
            uint8 s = uint8(g.status);
            assertTrue(
                s == uint8(WispGiftEscrow.GiftStatus.Funded) || s == uint8(WispGiftEscrow.GiftStatus.Claimed)
                    || s == uint8(WispGiftEscrow.GiftStatus.Refunded)
            );
        }
    }

    function invariant_priceChangeDoesNotAlterGift() public {
        uint256 nextId = escrow.nextGiftId();
        if (nextId <= 1) return;
        WispGiftEscrow.Gift memory beforeGift = escrow.getGift(1);
        uint128 amountBefore = beforeGift.amount;

        vm.prank(escrow.owner());
        registry.setAsset(
            address(stock),
            WispAssetRegistry.AssetConfig({
                enabled: true, decimals: 18, usdPriceE6: 999_000_000, assetKey: keccak256("WISPAAPL")
            })
        );

        assertEq(escrow.getGift(1).amount, amountBefore);
    }
}
