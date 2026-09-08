// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IB20} from "base-std/interfaces/IB20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Mints additional stock inventory to the demo router from existing B20 addresses.
contract SeedDemoInventory is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address router = vm.envAddress("DEMO_STOCK_ROUTER");
        address token = vm.envAddress("STOCK_TOKEN");
        uint256 amount = vm.envOr("SEED_AMOUNT", uint256(100_000 ether));

        vm.startBroadcast(pk);
        IB20(token).mint(deployer, amount);
        require(IERC20(token).transfer(router, amount), "transfer failed");
        vm.stopBroadcast();

        console2.log("seeded", token, amount);
        console2.log("routerBalance", IERC20(token).balanceOf(router));
    }
}
