// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import {EthexGame} from "../src/EthexGame.sol";

contract Deploy is Script {
    function run() external returns (EthexGame game) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        uint256 initialLiquidityEth = vm.envOr("INITIAL_LIQUIDITY_ETH", uint256(0));

        vm.startBroadcast(privateKey);

        game = new EthexGame();

        if (initialLiquidityEth > 0) {
            game.fundLiquidity{value: initialLiquidityEth * 1 ether}();
        }

        vm.stopBroadcast();

        console2.log("EthexGame deployed to", address(game));
        return game;
    }
}
