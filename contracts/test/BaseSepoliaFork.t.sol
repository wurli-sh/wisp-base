// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {WispAssetRegistry} from "../src/WispAssetRegistry.sol";
import {WispGiftEscrow} from "../src/WispGiftEscrow.sol";
import {WispDemoStockRouter} from "../src/WispDemoStockRouter.sol";
import {MockStock} from "./helpers/MockStock.sol";

/// @notice Fork smoke against Base Sepolia RPC from env (no hardcoded URL or silent skip).
contract BaseSepoliaFork is Test {
    function test_fork_deploysLocalStack() public {
        string memory rpc = vm.envOr("NEXT_PUBLIC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        }
        require(bytes(rpc).length != 0, "NEXT_PUBLIC_RPC_URL or BASE_SEPOLIA_RPC_URL required");
        vm.createSelectFork(rpc);
        assertEq(block.chainid, 84532);

        address owner = makeAddr("owner");
        (address claimSigner,) = makeAddrAndKey("claimSigner");
        address treasury = makeAddr("treasury");

        vm.startPrank(owner);
        MockUSDC usdc = new MockUSDC();
        WispAssetRegistry registry = new WispAssetRegistry(owner);
        WispGiftEscrow escrow = new WispGiftEscrow(owner, address(registry), claimSigner);
        WispDemoStockRouter router =
            new WispDemoStockRouter(address(usdc), address(registry), address(escrow), treasury);
        escrow.setDemoRouter(address(router));
        MockStock stock = new MockStock("Wisp Test Apple", "wAAPL", 18);
        registry.setAsset(
            address(stock),
            WispAssetRegistry.AssetConfig({
                enabled: true, decimals: 18, usdPriceE6: 316_000_000, assetKey: keccak256("WISPAAPL")
            })
        );
        vm.stopPrank();

        stock.mint(address(router), 100 ether);
        address sender = makeAddr("sender");
        usdc.faucet(sender, 316e6);

        vm.startPrank(sender);
        usdc.approve(address(router), 316e6);
        (uint256 giftId, uint256 amount) =
            router.buyAndGift(address(stock), 316e6, 1 ether, uint64(block.timestamp), uint64(block.timestamp + 7 days));
        vm.stopPrank();

        assertEq(giftId, 1);
        assertEq(amount, 1 ether);
        assertEq(escrow.lockedByToken(address(stock)), 1 ether);
    }
}
