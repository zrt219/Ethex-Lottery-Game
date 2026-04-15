// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EthexGame {
    uint256 public constant MIN_BET = 0.01 ether;
    uint256 public constant BET_SLOTS = 6;
    uint16 public constant HOUSE_EDGE_ONE_CELL_BPS = 1200;
    uint16 public constant HOUSE_EDGE_TWO_TO_THREE_CELLS_BPS = 1000;
    uint16 public constant HOUSE_EDGE_FOUR_TO_SIX_CELLS_BPS = 800;
    uint8 public constant CELL_ANY_LETTER = 16;
    uint8 public constant CELL_ANY_DIGIT = 17;
    uint8 public constant CELL_ODD_DIGIT = 18;
    uint8 public constant CELL_EVEN_DIGIT = 19;
    uint8 public constant CELL_EMPTY = type(uint8).max;

    error Unauthorized();
    error InvalidCellValue(uint8 index, uint8 value);
    error ZeroMarkedCells();
    error BetAmountTooSmall(uint256 sent, uint256 minimum);
    error InvalidMaxCount();
    error InsufficientLiquidity(uint256 available, uint256 required);
    error TransferFailed();
    error NothingToClaim();
    error HouseFeeWithdrawalTooLarge(uint256 requested, uint256 available);

    event BetPlaced(
        uint256 indexed betId,
        address indexed player,
        uint256 grossAmount,
        uint256 netAmount,
        uint16 houseEdgeBps,
        uint8 markedCount
    );
    event BetSettled(uint256 indexed betId, address indexed player, uint256 payoutAmount, bytes32 blockHash);
    event BetRefunded(uint256 indexed betId, address indexed player, uint256 refundAmount);
    event Claimed(address indexed player, uint256 amount);
    event LiquidityFunded(address indexed funder, uint256 amount);
    event HouseFeesWithdrawn(address indexed to, uint256 amount);

    enum BetStatus {
        Pending,
        Settled,
        Refunded
    }

    struct Bet {
        address player;
        uint256 grossAmount;
        uint256 netAmount;
        uint256 maxPayout;
        uint64 placedBlock;
        uint8 markedCount;
        BetStatus status;
        uint8[6] cells;
    }

    address public immutable owner;
    uint256 public nextBetId = 1;
    uint256 public nextUnsettledBetId = 1;
    uint256 public reservedExposure;
    uint256 public houseFeesAccrued;
    uint256 public totalClaimable;

    mapping(uint256 => Bet) private bets;
    mapping(address => uint256) private claimableBalances;

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function placeBet(uint8[6] calldata cells) external payable returns (uint256 betId) {
        if (msg.value < MIN_BET) revert BetAmountTooSmall(msg.value, MIN_BET);

        (uint8 markedCount, uint256 totalWeight) = _countMarkedCellsAndTotalWeight(cells);
        uint16 houseEdgeBps = _houseEdgeBps(markedCount);
        uint256 houseFee = (msg.value * houseEdgeBps) / 10_000;
        uint256 netAmount = msg.value - houseFee;
        uint256 maxPayout = _maxPayout(netAmount, totalWeight, markedCount);
        uint256 requiredLiquidity = houseFee + maxPayout;
        uint256 available = availableLiquidity();

        if (available < requiredLiquidity) revert InsufficientLiquidity(available, requiredLiquidity);

        betId = nextBetId++;
        Bet storage bet = bets[betId];
        bet.player = msg.sender;
        bet.grossAmount = msg.value;
        bet.netAmount = netAmount;
        bet.maxPayout = maxPayout;
        bet.placedBlock = uint64(block.number);
        bet.markedCount = markedCount;
        bet.status = BetStatus.Pending;
        bet.cells = cells;

        reservedExposure += maxPayout;
        houseFeesAccrued += houseFee;

        emit BetPlaced(betId, msg.sender, msg.value, netAmount, houseEdgeBps, markedCount);
    }

    function settleBets(uint256 maxCount) external returns (uint256 processed) {
        if (maxCount == 0) revert InvalidMaxCount();

        uint256 currentBetId = nextUnsettledBetId;
        uint256 stopAt = nextBetId;

        while (currentBetId < stopAt && processed < maxCount) {
            Bet storage bet = bets[currentBetId];

            if (bet.status != BetStatus.Pending) {
                currentBetId++;
                continue;
            }

            if (bet.placedBlock >= block.number) break;

            reservedExposure -= bet.maxPayout;

            if (block.number > uint256(bet.placedBlock) + 256) {
                bet.status = BetStatus.Refunded;
                claimableBalances[bet.player] += bet.netAmount;
                totalClaimable += bet.netAmount;
                emit BetRefunded(currentBetId, bet.player, bet.netAmount);
            } else {
                bytes32 resultHash = blockhash(uint256(bet.placedBlock));
                uint256 payoutAmount = _payoutAmount(bet.cells, resultHash, bet.netAmount, bet.markedCount);
                bet.status = BetStatus.Settled;

                if (payoutAmount > 0) {
                    claimableBalances[bet.player] += payoutAmount;
                    totalClaimable += payoutAmount;
                }

                emit BetSettled(currentBetId, bet.player, payoutAmount, resultHash);
            }

            currentBetId++;
            processed++;
        }

        nextUnsettledBetId = currentBetId;
    }

    function claim() external {
        uint256 amount = claimableBalances[msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimableBalances[msg.sender] = 0;
        totalClaimable -= amount;

        (bool success,) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit Claimed(msg.sender, amount);
    }

    function fundLiquidity() external payable {
        emit LiquidityFunded(msg.sender, msg.value);
    }

    function withdrawHouseFees(address to, uint256 amount) external onlyOwner {
        if (amount > houseFeesAccrued) revert HouseFeeWithdrawalTooLarge(amount, houseFeesAccrued);

        houseFeesAccrued -= amount;
        (bool success,) = to.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit HouseFeesWithdrawn(to, amount);
    }

    function previewBet(uint8[6] calldata cells, uint256 amount)
        external
        pure
        returns (uint8 markedCount, uint16 houseEdgeBps, uint256 houseFee, uint256 netAmount, uint256 maxPayout)
    {
        uint256 totalWeight;
        (markedCount, totalWeight) = _countMarkedCellsAndTotalWeight(cells);
        houseEdgeBps = _houseEdgeBps(markedCount);
        houseFee = (amount * houseEdgeBps) / 10_000;
        netAmount = amount - houseFee;
        maxPayout = _maxPayout(netAmount, totalWeight, markedCount);
    }

    function countMarkedCells(uint8[6] calldata cells) external pure returns (uint8) {
        (uint8 markedCount,) = _countMarkedCellsAndTotalWeight(cells);
        return markedCount;
    }

    function getBet(uint256 betId)
        external
        view
        returns (
            address player,
            uint256 grossAmount,
            uint256 netAmount,
            uint256 maxPayout,
            uint64 placedBlock,
            uint8 markedCount,
            BetStatus status,
            uint8[6] memory cells
        )
    {
        Bet storage bet = bets[betId];
        return (
            bet.player,
            bet.grossAmount,
            bet.netAmount,
            bet.maxPayout,
            bet.placedBlock,
            bet.markedCount,
            bet.status,
            bet.cells
        );
    }

    function claimable(address user) external view returns (uint256) {
        return claimableBalances[user];
    }

    function pendingCursor() external view returns (uint256, uint256) {
        return (nextUnsettledBetId, nextBetId);
    }

    function availableLiquidity() public view returns (uint256) {
        uint256 allocated = houseFeesAccrued + totalClaimable + reservedExposure;
        uint256 balance = address(this).balance;
        return allocated >= balance ? 0 : balance - allocated;
    }

    function _countMarkedCellsAndTotalWeight(uint8[6] memory cells) internal pure returns (uint8 markedCount, uint256 totalWeight) {
        for (uint8 i = 0; i < BET_SLOTS; i++) {
            uint8 cell = cells[i];
            if (cell == CELL_EMPTY) continue;
            if (cell > CELL_EVEN_DIGIT) revert InvalidCellValue(i, cell);

            markedCount++;
            totalWeight += _weightForCell(cell);
        }

        if (markedCount == 0) revert ZeroMarkedCells();
    }

    function _houseEdgeBps(uint8 markedCount) internal pure returns (uint16) {
        if (markedCount == 0) revert ZeroMarkedCells();
        if (markedCount == 1) return HOUSE_EDGE_ONE_CELL_BPS;
        if (markedCount <= 3) return HOUSE_EDGE_TWO_TO_THREE_CELLS_BPS;
        return HOUSE_EDGE_FOUR_TO_SIX_CELLS_BPS;
    }

    function _maxPayout(uint256 netAmount, uint256 totalWeight, uint8 markedCount) internal pure returns (uint256) {
        return (netAmount * totalWeight * 8) / (15 * markedCount);
    }

    function _payoutAmount(uint8[6] memory cells, bytes32 resultHash, uint256 netAmount, uint8 markedCount)
        internal
        pure
        returns (uint256)
    {
        uint256 matchedWeight;

        for (uint8 i = 0; i < BET_SLOTS; i++) {
            uint8 field = _nibbleAt(resultHash, i);
            uint8 cell = cells[i];

            if (cell == CELL_EMPTY) continue;

            if (cell < 16) {
                if (field == cell) matchedWeight += 30;
                continue;
            }

            if (cell == CELL_ANY_LETTER) {
                if (field > 9) matchedWeight += 5;
                continue;
            }

            if (cell == CELL_ANY_DIGIT) {
                if (field < 10) matchedWeight += 3;
                continue;
            }

            if (cell == CELL_ODD_DIGIT) {
                if (field < 10 && field % 2 == 1) matchedWeight += 6;
                continue;
            }

            if (cell == CELL_EVEN_DIGIT) {
                if (field < 10 && field % 2 == 0) matchedWeight += 6;
            }
        }

        return (netAmount * matchedWeight * 8) / (15 * markedCount);
    }

    function _weightForCell(uint8 cell) internal pure returns (uint256) {
        if (cell < 16) return 30;
        if (cell == CELL_ANY_LETTER) return 5;
        if (cell == CELL_ANY_DIGIT) return 3;
        return 6;
    }

    function _nibbleAt(bytes32 resultHash, uint8 index) internal pure returns (uint8) {
        uint8 byteIndex = 29 + (index / 2);
        bytes1 source = resultHash[byteIndex];
        return index % 2 == 0 ? uint8(source) >> 4 : uint8(source) & 0x0f;
    }
}
