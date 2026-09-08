// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {WispAssetRegistry} from "../src/WispAssetRegistry.sol";
import {WispGiftEscrow} from "../src/WispGiftEscrow.sol";
import {WispDemoStockRouter} from "../src/WispDemoStockRouter.sol";
import {MockStock} from "./helpers/MockStock.sol";

abstract contract WispTestBase is Test {
    bytes32 internal constant AAPL_KEY = keccak256("WISPAAPL");
    uint64 internal constant AAPL_PRICE = 316_000_000;

    MockUSDC internal usdc;
    WispAssetRegistry internal registry;
    WispGiftEscrow internal escrow;
    WispDemoStockRouter internal router;
    MockStock internal stock;

    address internal owner = makeAddr("owner");
    address internal claimSigner;
    uint256 internal claimSignerPk;
    address internal treasury = makeAddr("treasury");
    address internal sender = makeAddr("sender");
    address internal recipient = makeAddr("recipient");
    address internal relayer = makeAddr("relayer");

    function setUpBase() internal {
        (claimSigner, claimSignerPk) = makeAddrAndKey("claimSigner");

        vm.startPrank(owner);
        usdc = new MockUSDC();
        registry = new WispAssetRegistry(owner);
        escrow = new WispGiftEscrow(owner, address(registry), claimSigner);
        router = new WispDemoStockRouter(address(usdc), address(registry), address(escrow), treasury);
        escrow.setDemoRouter(address(router));
        stock = new MockStock("Wisp Test Apple", "wAAPL", 18);
        registry.setAsset(
            address(stock),
            WispAssetRegistry.AssetConfig({enabled: true, decimals: 18, usdPriceE6: AAPL_PRICE, assetKey: AAPL_KEY})
        );
        vm.stopPrank();

        stock.mint(address(router), 1_000_000 ether);
    }

    function _signClaim(uint256 giftId, address to, uint64 deadline) internal view returns (bytes memory) {
        bytes32 digest = escrow.claimAuthorizationDigest(giftId, to, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(claimSignerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _window() internal view returns (uint64 unlockAt, uint64 expiresAt) {
        unlockAt = uint64(block.timestamp);
        expiresAt = uint64(block.timestamp + 7 days);
    }
}
