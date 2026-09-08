// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StdPrecompiles} from "base-std/StdPrecompiles.sol";
import {B20FactoryLib} from "base-std/lib/B20FactoryLib.sol";
import {B20Constants} from "base-std/lib/B20Constants.sol";
import {IB20Factory} from "base-std/interfaces/IB20Factory.sol";
import {IB20} from "base-std/interfaces/IB20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {WispAssetRegistry} from "../src/WispAssetRegistry.sol";
import {WispGiftEscrow} from "../src/WispGiftEscrow.sol";
import {WispDemoStockRouter} from "../src/WispDemoStockRouter.sol";

/// @notice Full Sepolia deploy: B20 stocks + Wisp contracts + registry config + inventory seed.
contract DeployWisp is Script {
    uint256 internal constant INVENTORY = 100_000 ether;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address claimSigner = vm.envOr("CLAIM_SIGNER_ADDRESS", deployer);
        string memory saltNamespace = vm.envOr("B20_SALT_NAMESPACE", string("v1"));

        vm.startBroadcast(pk);

        MockUSDC usdc = new MockUSDC();
        WispAssetRegistry registry = new WispAssetRegistry(deployer);
        WispGiftEscrow escrow = new WispGiftEscrow(deployer, address(registry), claimSigner);
        WispDemoStockRouter router =
            new WispDemoStockRouter(address(usdc), address(registry), address(escrow), deployer);
        escrow.setDemoRouter(address(router));

        console2.log("mockUsdc", address(usdc));
        console2.log("assetRegistry", address(registry));
        console2.log("giftEscrow", address(escrow));
        console2.log("demoStockRouter", address(router));
        console2.log("claimSigner", claimSigner);
        console2.log("treasury", deployer);
        console2.log("faucetMax", usdc.FAUCET_MAX());
        console2.log("faucetCooldown", uint256(usdc.FAUCET_COOLDOWN()));

        _createConfigureSeed(
            registry,
            address(router),
            deployer,
            "WISPAAPL",
            "Wisp Test Apple",
            "wAAPL",
            316_000_000,
            _assetSalt("wAAPL", saltNamespace)
        );
        _createConfigureSeed(
            registry,
            address(router),
            deployer,
            "WISPNVDA",
            "Wisp Test NVIDIA",
            "wNVDA",
            225_000_000,
            _assetSalt("wNVDA", saltNamespace)
        );
        _createConfigureSeed(
            registry,
            address(router),
            deployer,
            "WISPTSLA",
            "Wisp Test Tesla",
            "wTSLA",
            367_000_000,
            _assetSalt("wTSLA", saltNamespace)
        );

        vm.stopBroadcast();
    }

    function _assetSalt(string memory symbol, string memory saltNamespace) internal pure returns (bytes32) {
        return keccak256(bytes(string.concat("wisp-", symbol, "-", saltNamespace)));
    }

    function _createConfigureSeed(
        WispAssetRegistry registry,
        address router,
        address deployer,
        string memory key,
        string memory name,
        string memory symbol,
        uint64 usdPriceE6,
        bytes32 salt
    ) internal {
        bytes memory params = B20FactoryLib.encodeAssetCreateParams(name, symbol, deployer, 18);
        bytes[] memory initCalls = new bytes[](2);
        initCalls[0] = B20FactoryLib.encodeGrantRole(B20Constants.MINT_ROLE, deployer);
        initCalls[1] = B20FactoryLib.encodeUpdateSupplyCap(B20Constants.MAX_SUPPLY_CAP);

        address token = StdPrecompiles.B20_FACTORY.createB20(IB20Factory.B20Variant.ASSET, salt, params, initCalls);

        if (!_probe(token, deployer)) {
            console2.log("SKIPPED_ASSET", key);
            return;
        }

        registry.setAsset(
            token,
            WispAssetRegistry.AssetConfig({
                enabled: true, decimals: 18, usdPriceE6: usdPriceE6, assetKey: keccak256(bytes(key))
            })
        );

        IB20(token).mint(deployer, INVENTORY);
        require(IERC20(token).transfer(router, INVENTORY), "seed transfer failed");
        console2.log(key, token);
    }

    function _probe(address token, address holder) internal returns (bool) {
        address sink = address(uint160(uint256(keccak256(abi.encode(token, "sink")))));
        try IB20(token).mint(holder, 3 ether) {
            if (!IERC20(token).transfer(sink, 1 ether)) return false;
            // Pull back via transferFrom: sink has no code, so approve from sink is impossible without
            // impersonation. Probe approve + transferFrom against holder self-allowance instead.
            if (!IERC20(token).approve(holder, 1 ether)) return false;
            if (!IERC20(token).transferFrom(holder, holder, 1 ether)) return false;
            return true;
        } catch {
            return false;
        }
    }
}
