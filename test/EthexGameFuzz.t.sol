// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {EthexGame} from "../src/EthexGame.sol";

contract EthexGameFuzzTest is Test {
    EthexGame internal game;
    uint256 internal constant MIN_BET = 0.01 ether;

    function setUp() public {
        game = new EthexGame();
        game.fundLiquidity{value: 10 ether}();
    }

    function testFuzzMarkedCellCountInvariant(uint8[6] calldata cells, uint256 amount) public {
        amount = bound(amount, MIN_BET, 100 ether);

        bool valid = areValid(cells);
        if (!valid) {
            vm.expectRevert();
            game.previewBet(cells, amount);
            return;
        }

        if (!hasMarkedCell(cells)) {
            vm.expectRevert(EthexGame.ZeroMarkedCells.selector);
            game.previewBet(cells, amount);
            return;
        }

        (uint8 markedCount, uint16 houseEdgeBps, uint256 houseFee, uint256 netAmount, uint256 maxPayout) =
            game.previewBet(cells, amount);

        assertGe(markedCount, 1);
        assertLe(markedCount, 6);
        assertEq(amount, houseFee + netAmount);

        if (markedCount == 1) assertEq(houseEdgeBps, 1200);
        else if (markedCount <= 3) assertEq(houseEdgeBps, 1000);
        else assertEq(houseEdgeBps, 800);

        assertGe(maxPayout, netAmount);
    }

    function testFuzzPlaceBetAccountingInvariant(uint8[6] calldata cells, uint256 amount) public {
        amount = bound(amount, MIN_BET, 5 ether);
        vm.assume(areValid(cells));
        vm.assume(hasMarkedCell(cells));

        address player = address(uint160(uint256(keccak256(abi.encode(cells, amount)))));
        vm.deal(player, amount);

        (uint8 markedCount, uint16 houseEdgeBps, uint256 houseFee, uint256 netAmount, uint256 maxPayout) =
            game.previewBet(cells, amount);

        assertGt(markedCount, 0);
        assertTrue(houseEdgeBps == 1200 || houseEdgeBps == 1000 || houseEdgeBps == 800);
        vm.assume(game.availableLiquidity() + amount >= houseFee + maxPayout);

        vm.prank(player);
        game.placeBet{value: amount}(cells);

        assertEq(amount, houseFee + netAmount);
        assertEq(game.houseFeesAccrued(), houseFee);
        assertEq(game.reservedExposure(), maxPayout);
        assertLe(game.houseFeesAccrued() + game.reservedExposure() + game.totalClaimable(), address(game).balance);
    }

    function areValid(uint8[6] calldata cells) internal pure returns (bool) {
        for (uint8 i = 0; i < 6; i++) {
            if (cells[i] != 255 && cells[i] > 19) return false;
        }
        return true;
    }

    function hasMarkedCell(uint8[6] calldata cells) internal pure returns (bool) {
        for (uint8 i = 0; i < 6; i++) {
            if (cells[i] != 255) return true;
        }
        return false;
    }
}
