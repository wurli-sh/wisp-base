// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {WispAssetRegistry} from "../src/WispAssetRegistry.sol";

contract MockUSDCTest is Test {
    MockUSDC internal usdc;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        usdc = new MockUSDC();
    }

    function test_metadata() public view {
        assertEq(usdc.name(), "Wisp Test USDC");
        assertEq(usdc.symbol(), "tUSDC");
        assertEq(usdc.decimals(), 6);
        assertEq(usdc.faucetMax(), 1_000e6);
    }

    function test_faucet_mintsToRecipient() public {
        usdc.faucet(alice, 100e6);
        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(address(this)), 0);
    }

    function test_faucet_rejectsAboveCap() public {
        vm.expectRevert();
        usdc.faucet(alice, 1_000e6 + 1);
    }

    function test_faucet_cooldown() public {
        usdc.faucet(alice, 1e6);
        uint64 ready = usdc.faucetCooldown(alice);
        assertGt(ready, block.timestamp);

        vm.expectRevert();
        usdc.faucet(alice, 1e6);

        vm.warp(ready);
        usdc.faucet(alice, 1e6);
        assertEq(usdc.balanceOf(alice), 2e6);
    }

    function test_permit() public {
        uint256 pk = 0xA11CE;
        address owner = vm.addr(pk);
        usdc.faucet(owner, 50e6);

        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = _permitDigest(owner, bob, 50e6, usdc.nonces(owner), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);

        usdc.permit(owner, bob, 50e6, deadline, v, r, s);
        assertEq(usdc.allowance(owner, bob), 50e6);

        vm.prank(bob);
        assertTrue(usdc.transferFrom(owner, bob, 50e6));
        assertEq(usdc.balanceOf(bob), 50e6);
    }

    function _permitDigest(address owner, address spender, uint256 value, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 PERMIT_TYPEHASH =
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonce, deadline));
        return MessageHashUtils.toTypedDataHash(usdc.DOMAIN_SEPARATOR(), structHash);
    }
}

contract WispAssetRegistryTest is Test {
    WispAssetRegistry internal registry;
    address internal owner = makeAddr("owner");
    address internal token = makeAddr("token");

    function setUp() public {
        registry = new WispAssetRegistry(owner);
    }

    function test_setAndQuote() public {
        vm.prank(owner);
        registry.setAsset(
            token,
            WispAssetRegistry.AssetConfig({
                enabled: true, decimals: 18, usdPriceE6: 316_000_000, assetKey: keccak256("WISPAAPL")
            })
        );

        assertTrue(registry.isEnabled(token));
        // $316 buys 1e18 stock units at $316/share
        assertEq(registry.quoteStockAmount(token, 316e6), 1 ether);
        // $632 buys 2 shares
        assertEq(registry.quoteStockAmount(token, 632e6), 2 ether);
    }

    function test_rejectsInvalidConfig() public {
        vm.startPrank(owner);
        vm.expectRevert();
        registry.setAsset(
            address(0),
            WispAssetRegistry.AssetConfig({enabled: true, decimals: 18, usdPriceE6: 1, assetKey: keccak256("a")})
        );
        vm.expectRevert();
        registry.setAsset(
            token, WispAssetRegistry.AssetConfig({enabled: true, decimals: 18, usdPriceE6: 0, assetKey: keccak256("a")})
        );
        vm.expectRevert();
        registry.setAsset(
            token, WispAssetRegistry.AssetConfig({enabled: true, decimals: 19, usdPriceE6: 1, assetKey: keccak256("a")})
        );
        vm.expectRevert();
        registry.setAsset(
            token, WispAssetRegistry.AssetConfig({enabled: true, decimals: 18, usdPriceE6: 1, assetKey: bytes32(0)})
        );
        vm.stopPrank();
    }
}
