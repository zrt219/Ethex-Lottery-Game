// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {EthexGame} from "../src/EthexGame.sol";

contract EthexGameTest is Test {
    EthexGame internal game;

    address internal owner = address(this);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant MIN_BET = 0.01 ether;

    function setUp() public {
        game = new EthexGame();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        game.fundLiquidity{value: 20 ether}();
    }

    function testCountMarkedCellsAcrossSizes() public {
        assertEq(game.countMarkedCells([uint8(0), 1, 2, 3, 4, 5]), 6);
        assertEq(game.countMarkedCells([uint8(0), 1, 2, 3, 4, 255]), 5);
        assertEq(game.countMarkedCells([uint8(16), 17, 18, 255, 255, 255]), 3);
    }

    function testPreviewFeeTierForOneMarkedCell() public {
        (uint8 markedCount, uint16 houseEdgeBps, uint256 houseFee, uint256 netAmount,) =
            game.previewBet(singleExactCell(), 1 ether);

        assertEq(markedCount, 1);
        assertEq(houseEdgeBps, 1200);
        assertEq(houseFee, 0.12 ether);
        assertEq(netAmount, 0.88 ether);
    }

    function testPreviewFeeTierForTwoMarkedCells() public {
        (uint8 markedCount, uint16 houseEdgeBps, uint256 houseFee, uint256 netAmount,) =
            game.previewBet([uint8(1), 2, 255, 255, 255, 255], 1 ether);

        assertEq(markedCount, 2);
        assertEq(houseEdgeBps, 1000);
        assertEq(houseFee, 0.1 ether);
        assertEq(netAmount, 0.9 ether);
    }

    function testPreviewFeeTierBands() public {
        assertEq(getHouseEdge(singleExactCell()), 1200);
        assertEq(getHouseEdge([uint8(1), 2, 255, 255, 255, 255]), 1000);
        assertEq(getHouseEdge([uint8(1), 2, 3, 255, 255, 255]), 1000);
        assertEq(getHouseEdge([uint8(1), 2, 3, 4, 255, 255]), 800);
        assertEq(getHouseEdge([uint8(1), 2, 3, 4, 5, 255]), 800);
        assertEq(getHouseEdge([uint8(1), 2, 3, 4, 5, 6]), 800);
    }

    function testPreviewForOneThroughSixCells() public {
        assertEq(game.countMarkedCells(singleExactCell()), 1);
        assertEq(game.countMarkedCells([uint8(1), 255, 255, 255, 255, 255]), 1);
        assertEq(game.countMarkedCells([uint8(1), 2, 255, 255, 255, 255]), 2);
        assertEq(game.countMarkedCells([uint8(1), 2, 3, 255, 255, 255]), 3);
        assertEq(game.countMarkedCells([uint8(1), 2, 3, 4, 255, 255]), 4);
        assertEq(game.countMarkedCells([uint8(1), 2, 3, 4, 5, 255]), 5);
        assertEq(game.countMarkedCells([uint8(1), 2, 3, 4, 5, 6]), 6);
    }

    function testRevertOnZeroMarkedCells() public {
        uint8[6] memory cells = [uint8(255), 255, 255, 255, 255, 255];
        vm.expectRevert(EthexGame.ZeroMarkedCells.selector);
        game.countMarkedCells(cells);
    }

    function testRevertOnInvalidCellValue() public {
        uint8[6] memory cells = [uint8(0), 1, 2, 3, 4, 21];
        vm.expectRevert(abi.encodeWithSelector(EthexGame.InvalidCellValue.selector, uint8(5), uint8(21)));
        game.previewBet(cells, 1 ether);
    }

    function testRevertOnBetBelowMinimum() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(EthexGame.BetAmountTooSmall.selector, MIN_BET - 1, MIN_BET));
        game.placeBet{value: MIN_BET - 1}(singleExactCell());
    }

    function testRevertOnSettleWithZeroMaxCount() public {
        vm.expectRevert(EthexGame.InvalidMaxCount.selector);
        game.settleBets(0);
    }

    function testRejectsBetWhenLiquidityIsInsufficient() public {
        EthexGame leanGame = new EthexGame();
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(EthexGame.InsufficientLiquidity.selector, MIN_BET, 0.142 ether));
        leanGame.placeBet{value: MIN_BET}(singleExactCell());
    }

    function testStopsWhenTryingToSettleCurrentBlockBet() public {
        vm.prank(alice);
        uint256 betId = game.placeBet{value: MIN_BET}(singleExactCell());

        uint256 processed = game.settleBets(1);
        assertEq(processed, 0);

        (uint256 cursor,) = game.pendingCursor();
        assertEq(cursor, betId);
    }

    function testRefundUsesCorrectNetAmount() public {
        vm.prank(alice);
        game.placeBet{value: MIN_BET}(singleExactCell());

        vm.roll(block.number + 257);
        game.settleBets(1);

        assertEq(game.claimable(alice), 0.0088 ether);
    }

    function testExactMatchSettlementCreditsClaimable() public {
        uint8[6] memory cells = [uint8(1), 2, 3, 4, 5, 6];

        vm.prank(alice);
        uint256 betId = game.placeBet{value: 1 ether}(cells);

        (, , uint256 netAmount,, uint64 placedBlock, uint8 markedCount,,) = game.getBet(betId);

        bytes32 forcedHash = bytes32(hex"000000000000000000000000000000000000000000000000000000123456abcd");
        vm.setBlockhash(placedBlock, forcedHash);
        vm.roll(block.number + 1);

        game.settleBets(1);

        uint256 expectedPayout = expectedPayoutForHash(cells, forcedHash, netAmount, markedCount);
        assertEq(game.claimable(alice), expectedPayout);
    }

    function testWildcardMatchSettlementCreditsClaimable() public {
        uint8[6] memory cells = [uint8(16), 17, 18, 19, 16, 17];

        vm.prank(alice);
        uint256 betId = game.placeBet{value: 1 ether}(cells);

        (, , uint256 netAmount,, uint64 placedBlock, uint8 markedCount,,) = game.getBet(betId);

        bytes32 forcedHash = bytes32(hex"000000000000000000000000000000000000000000000000000000ab9821ffff");
        vm.setBlockhash(placedBlock, forcedHash);
        vm.roll(block.number + 1);

        game.settleBets(1);

        uint256 expectedPayout = expectedPayoutForHash(cells, forcedHash, netAmount, markedCount);
        assertEq(game.claimable(alice), expectedPayout);
        assertGt(expectedPayout, 0);
    }

    function testNoMatchSettlementCreditsZero() public {
        uint8[6] memory cells = [uint8(15), 15, 15, 15, 15, 15];

        vm.prank(alice);
        uint256 betId = game.placeBet{value: 1 ether}(cells);

        (, , uint256 netAmount,, uint64 placedBlock, uint8 markedCount,,) = game.getBet(betId);

        bytes32 forcedHash = bytes32(hex"0000000000000000000000000000000000000000000000000000000123456789");
        vm.setBlockhash(placedBlock, forcedHash);
        vm.roll(block.number + 1);

        game.settleBets(1);

        uint256 expectedPayout = expectedPayoutForHash(cells, forcedHash, netAmount, markedCount);
        assertEq(expectedPayout, 0);
        assertEq(game.claimable(alice), 0);
    }

    function testCannotDoubleSettleBet() public {
        vm.prank(alice);
        uint256 betId = game.placeBet{value: MIN_BET}(singleExactCell());

        (, , uint256 netAmount,, uint64 placedBlock, uint8 markedCount,, uint8[6] memory cells) = game.getBet(betId);

        bytes32 forcedHash = bytes32(hex"0000000000000000000000000000000000000000000000000000000000000001");
        vm.setBlockhash(placedBlock, forcedHash);
        vm.roll(block.number + 1);

        uint256 processed = game.settleBets(1);
        assertEq(processed, 1);

        uint256 firstClaimable = game.claimable(alice);
        uint256 expectedPayout = expectedPayoutForHash(cells, forcedHash, netAmount, markedCount);
        assertEq(firstClaimable, expectedPayout);

        processed = game.settleBets(1);
        assertEq(processed, 0);
        assertEq(game.claimable(alice), firstClaimable);
    }

    function testClaimReducesClaimableAndTransfersFunds() public {
        vm.prank(alice);
        game.placeBet{value: MIN_BET}(singleExactCell());

        vm.roll(block.number + 257);
        game.settleBets(1);

        uint256 claimableBefore = game.claimable(alice);
        uint256 aliceBefore = alice.balance;

        vm.prank(alice);
        game.claim();

        assertEq(game.claimable(alice), 0);
        assertEq(alice.balance, aliceBefore + claimableBefore);
    }

    function testWithdrawHouseFeesRevertsWhenTooLarge() public {
        vm.expectRevert(abi.encodeWithSelector(EthexGame.HouseFeeWithdrawalTooLarge.selector, 1, 0));
        game.withdrawHouseFees(owner, 1);
    }

    function testAccountingBucketsStayWithinBalance() public {
        vm.prank(alice);
        game.placeBet{value: 1 ether}(singleExactCell());

        uint256 allocated = game.houseFeesAccrued() + game.reservedExposure() + game.totalClaimable();
        assertLe(allocated, address(game).balance);
    }

    function singleExactCell() internal pure returns (uint8[6] memory cells) {
        cells[0] = 1;
        cells[1] = 255;
        cells[2] = 255;
        cells[3] = 255;
        cells[4] = 255;
        cells[5] = 255;
    }

    function getHouseEdge(uint8[6] memory cells) internal view returns (uint16 houseEdgeBps) {
        (, houseEdgeBps,,,) = game.previewBet(cells, 1 ether);
    }

    function expectedPayoutForHash(uint8[6] memory cells, bytes32 resultHash, uint256 netAmount, uint8 markedCount)
        internal
        pure
        returns (uint256 payout)
    {
        uint256 matchedWeight;
        for (uint8 i = 0; i < 6; i++) {
            uint8 nibble = nibbleAt(resultHash, i);
            uint8 cell = cells[i];

            if (cell < 16) {
                if (nibble == cell) matchedWeight += 30;
            } else if (cell == 16) {
                if (nibble > 9) matchedWeight += 5;
            } else if (cell == 17) {
                if (nibble < 10) matchedWeight += 3;
            } else if (cell == 18) {
                if (nibble < 10 && nibble % 2 == 1) matchedWeight += 6;
            } else if (cell == 19) {
                if (nibble < 10 && nibble % 2 == 0) matchedWeight += 6;
            }
        }

        payout = (netAmount * matchedWeight * 8) / (15 * markedCount);
    }

    function nibbleAt(bytes32 resultHash, uint8 index) internal pure returns (uint8) {
        uint8 byteIndex = 29 + (index / 2);
        bytes1 source = resultHash[byteIndex];
        return index % 2 == 0 ? uint8(source) >> 4 : uint8(source) & 0x0f;
    }
}
