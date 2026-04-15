// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/StdInvariant.sol";
import {EthexGame} from "../src/EthexGame.sol";

contract EthexGameHandler is Test {
    EthexGame internal immutable game;
    address[] internal actors;
    uint256 internal constant MIN_BET = 0.01 ether;

    constructor(EthexGame _game) {
        game = _game;
        actors.push(address(0xA1));
        actors.push(address(0xB2));
        actors.push(address(0xC3));

        for (uint256 i = 0; i < actors.length; i++) {
            vm.deal(actors[i], 100 ether);
        }
    }

    function fund(uint96 amount) external {
        uint256 value = bound(uint256(amount), 0.01 ether, 1 ether);
        game.fundLiquidity{value: value}();
    }

    function place(uint8 seed, uint96 amount) external {
        uint8[6] memory cells;
        for (uint8 i = 0; i < 6; i++) {
            cells[i] = i > 0 && ((seed + i) % 3 == 0) ? 255 : uint8((seed + i) % 20);
        }

        uint256 value = bound(uint256(amount), MIN_BET, 0.2 ether);
        address actor = actors[seed % actors.length];
        vm.prank(actor);

        try game.placeBet{value: value}(cells) {} catch {}
    }

    function advanceAndSettle(uint8 blocksForward, uint8 maxCount) external {
        vm.roll(block.number + bound(uint256(blocksForward), 1, 20));
        uint256 boundedCount = bound(uint256(maxCount), 1, 5);
        game.settleBets(boundedCount);
    }

    function claim(uint8 actorIndex) external {
        address actor = actors[actorIndex % actors.length];
        vm.prank(actor);
        try game.claim() {} catch {}
    }
}

contract EthexGameInvariantTest is StdInvariant, Test {
    EthexGame internal game;
    EthexGameHandler internal handler;

    function setUp() public {
        game = new EthexGame();
        game.fundLiquidity{value: 10 ether}();

        handler = new EthexGameHandler(game);
        targetContract(address(handler));
    }

    function invariant_accountingConservation() public view {
        uint256 allocated = game.houseFeesAccrued() + game.reservedExposure() + game.totalClaimable();
        assertLe(allocated, address(game).balance);
    }
}
