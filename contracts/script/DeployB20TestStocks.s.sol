// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StdPrecompiles} from "base-std/StdPrecompiles.sol";
import {B20FactoryLib} from "base-std/lib/B20FactoryLib.sol";
import {B20Constants} from "base-std/lib/B20Constants.sol";
import {IB20Factory} from "base-std/interfaces/IB20Factory.sol";
import {IB20} from "base-std/interfaces/IB20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Creates Wisp Test Apple / NVIDIA / Tesla B20 assets on Base Sepolia.
contract DeployB20TestStocks is Script {
    function run() external returns (address wAAPL, address wNVDA, address wTSLA) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        string memory saltNamespace = vm.envOr("B20_SALT_NAMESPACE", string("v1"));

        vm.startBroadcast(pk);
        wAAPL = _create("Wisp Test Apple", "wAAPL", _assetSalt("wAAPL", saltNamespace), deployer);
        wNVDA = _create("Wisp Test NVIDIA", "wNVDA", _assetSalt("wNVDA", saltNamespace), deployer);
        wTSLA = _create("Wisp Test Tesla", "wTSLA", _assetSalt("wTSLA", saltNamespace), deployer);
        vm.stopBroadcast();

        console2.log("wAAPL", wAAPL);
        console2.log("wNVDA", wNVDA);
        console2.log("wTSLA", wTSLA);
    }

    function _assetSalt(string memory symbol, string memory saltNamespace) internal pure returns (bytes32) {
        return keccak256(bytes(string.concat("wisp-", symbol, "-", saltNamespace)));
    }

    function _create(string memory name, string memory symbol, bytes32 salt, address admin)
        internal
        returns (address token)
    {
        bytes memory params = B20FactoryLib.encodeAssetCreateParams(name, symbol, admin, 18);
        bytes[] memory initCalls = new bytes[](2);
        initCalls[0] = B20FactoryLib.encodeGrantRole(B20Constants.MINT_ROLE, admin);
        initCalls[1] = B20FactoryLib.encodeUpdateSupplyCap(B20Constants.MAX_SUPPLY_CAP);
        token = StdPrecompiles.B20_FACTORY.createB20(IB20Factory.B20Variant.ASSET, salt, params, initCalls);

        IB20(token).mint(admin, 2 ether);
        address sink = address(uint160(uint256(keccak256(abi.encode(token, "b20-probe-sink")))));
        require(IERC20(token).transfer(sink, 1 ether), "transfer failed");
        require(IERC20(token).approve(admin, 1 ether), "approve failed");
        require(IERC20(token).transferFrom(admin, admin, 1 ether), "transferFrom failed");
    }
}
