# Architecture Overview

## Summary

The current repository is intentionally small. It has one production contract, one deployment script, three Foundry test suites, one Next.js UI, and one CI workflow. That shape is deliberate: the assessment is easier to review when the contract boundary is obvious and the supporting tooling is narrow.

The same disciplined scope is reflected in the measured execution window for the submission files: April 14, 2026 6:33:41 PM to April 14, 2026 8:02:00 PM, for an exact elapsed time of 1:28:18.7924261. That window supports the architecture choice by showing that a small contract surface and a thin UI layer made fast, high-confidence delivery possible.

## Current repo structure

```text
.
|-- README.md
|-- .env.example
|-- foundry.toml
|-- package.json
|-- src/
|   `-- EthexGame.sol
|-- script/
|   `-- Deploy.s.sol
|-- test/
|   |-- EthexGame.t.sol
|   |-- EthexGameFuzz.t.sol
|   `-- EthexGameInvariant.t.sol
|-- docs/
|   |-- architecture.md
|   |-- security-decisions.md
|   |-- original-repo-analysis.md
|   `-- deployment.md
|-- ui/
|   |-- app/
|   |-- components/
|   `-- lib/
`-- .github/workflows/ci.yml
```

## Runtime boundaries

### Contract boundary

`src/EthexGame.sol` is the only stateful on-chain runtime component.

It owns:

- Bet storage
- Marked-cell validation
- House-edge derivation
- Payout and refund computation
- Pending settlement cursor
- Claimable balances
- House-fee accounting
- Liquidity reservation

### Script boundary

`script/Deploy.s.sol` is intentionally thin. It deploys `EthexGame` and, if configured, calls `fundLiquidity()` once during deployment. It does not contain protocol logic.

### Test boundary

The test folder is split by purpose:

- `EthexGame.t.sol`: direct behavior tests
- `EthexGameFuzz.t.sol`: fuzzed validation and accounting properties
- `EthexGameInvariant.t.sol`: stateful invariant testing through a handler

### Frontend boundary

The UI in `ui/` is a thin interaction layer over the contract. It does not re-implement settlement. It does:

- Build local previews
- Read contract state
- Submit `placeBet`
- Submit `claim`
- Handle wallet connection and network switching

It currently uses Next.js, TypeScript, Tailwind, and `viem`. It does not use `wagmi` in the current implementation.

## Contract state model

At a high level the contract state is:

- `nextBetId`: append-only bet identifier
- `nextUnsettledBetId`: queue cursor for settlement
- `reservedExposure`: sum of reserved maximum payouts for pending bets
- `houseFeesAccrued`: owner-withdrawable house-fee balance
- `totalClaimable`: sum of all user claimable balances
- `bets`: mapping of bet id to explicit bet struct
- `claimableBalances`: mapping of address to withdrawable balance

Each bet stores:

- Player address
- Gross amount
- Net amount after house fee
- Maximum payout
- Placement block
- Marked-cell count
- Bet status
- Six selected cells

## Settlement and refund flow

### Placement flow

1. User calls `placeBet` with `uint8[6] cells` and ETH.
2. Contract validates the amount and each non-empty cell.
3. Contract counts marked cells and derives the fee tier.
4. Contract computes house fee, net amount, and maximum payout.
5. Contract checks that `availableLiquidity()` can cover the new exposure.
6. Contract stores the bet and increments `reservedExposure` and `houseFeesAccrued`.

### Settlement flow

1. Caller invokes `settleBets(maxCount)`.
2. Contract walks forward from `nextUnsettledBetId`.
3. If the next pending bet was placed in the current block, settlement stops.
4. If the bet is older than 256 blocks, it is marked refunded and `netAmount` is credited to `claimableBalances`.
5. Otherwise, the contract reads `blockhash(placedBlock)`, computes payout, marks the bet settled, and credits any winnings to `claimableBalances`.
6. `reservedExposure` is released as each pending bet is processed.

### Claim flow

1. User calls `claim()`.
2. Contract reads the recorded claimable amount.
3. Internal balances are reduced before the external call.
4. ETH is sent with `call`.

## Accounting and liquidity model

The key solvency idea in the current contract is that ETH obligations are tracked separately.

Accounting buckets:

- `reservedExposure`
- `houseFeesAccrued`
- `totalClaimable`

Free liquidity is computed as:

`address(this).balance - (reservedExposure + houseFeesAccrued + totalClaimable)`

That model gives the contract a simple answer to two important questions:

- Can a new bet be accepted safely?
- Are tracked obligations still covered by current balance?

## Frontend integration model

The UI's integration model is intentionally direct:

- Chain config comes from `ui/lib/contract.ts`
- Contract reads use `createPublicClient`
- Contract writes use `createWalletClient`
- The UI supports operation without a configured address for review purposes, but live reads and writes require `NEXT_PUBLIC_CONTRACT_ADDRESS`

The main user-facing panels map directly to current code:

- Overview
- Wallet and deployment context
- Live contract posture
- Bet builder
- Engineering notes
- Recent activity log

## Deployment model

The current deployment model is environment-driven:

- Foundry uses `RPC_URL`, `PRIVATE_KEY`, `CHAIN_ID`, and `INITIAL_LIQUIDITY_ETH`
- The UI uses `NEXT_PUBLIC_*` values for chain and contract wiring
- Vercel is intended to deploy the `ui/` directory directly

The frontend is live on Vercel at [https://ui-pi-eight.vercel.app](https://ui-pi-eight.vercel.app).

The XRPL EVM contract is deployed at [0x6a481F555Ba68895Bc08854d677464f96D54C43d](https://explorer.testnet.xrplevm.org/address/0x6a481F555Ba68895Bc08854d677464f96D54C43d).

## System diagram

```text
Wallet / operator
    |
    v
ui/ (Next.js + viem)
    |
    v
EthexGame.sol
    |-- stores bets
    |-- reserves liquidity
    |-- accrues house fees
    `-- credits claimable balances
```

## Why this architecture is intentionally small

The original GitLab repo proved that the business problem had already accumulated extra state and operational side systems. For an assessment, that is usually the wrong direction. The current architecture is intentionally small because it:

- keeps the deterministic core visible
- makes tests map directly to business rules
- reduces deployment complexity
- avoids secondary contracts whose value is mostly historical
- helps a reviewer understand the repo in one pass
