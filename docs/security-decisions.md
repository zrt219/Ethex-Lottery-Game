# Security Decisions

## Scope-aware threat model

The current repo has a narrow on-chain scope:

- users place ETH-backed bets
- anyone can advance settlement
- users claim payouts or refunds
- the owner can withdraw tracked house fees

Within that scope, the main security concerns are:

- malformed bet input
- under-reserved liquidity
- unsafe state transitions during settlement
- payout or refund errors
- owner withdrawal exceeding tracked fees
- unexpected behavior around external ETH transfers

This document focuses on those actual risks rather than a generic protocol checklist.

That narrow scope is also what made the measured execution window realistic: the submission files were created between April 14, 2026 6:33:41 PM and April 14, 2026 8:02:00 PM, for an exact elapsed time of 1:28:18.7924261. The pace was possible because simplicity, explicit validation, and bounded behavior reduced the risk of a fragile rush job.

## Validation rules and why they exist

### Minimum bet enforcement

`placeBet` reverts if `msg.value < MIN_BET`. This prevents dust inputs from bypassing the intended economics and keeps test assumptions stable.

### Cell validation

The contract supports:

- `0-15` exact nibble selections
- `16` any letter
- `17` any digit
- `18` odd digit
- `19` even digit
- `255` empty slot sentinel in the modern `uint8[6]` input model

Any other value reverts with `InvalidCellValue`. The legacy system tolerated more ambiguity through packed bytes; the current implementation makes unsupported values fail fast.

### Zero-marked bets

If all six cells are empty, the contract reverts with `ZeroMarkedCells`. This is an explicit replacement for the kind of indirect failure that often existed in older Solidity code.

### Liquidity validation

At placement time, the contract computes the bet's maximum possible payout and rejects the bet if the contract does not have enough unallocated ETH to support that exposure.

## State transition safety

The contract keeps its state machine intentionally small:

- `Pending`
- `Settled`
- `Refunded`

A bet is created as `Pending` and can only move once to `Settled` or `Refunded`. The settlement loop skips any bet that is no longer pending, which prevents double processing.

The contract also stops settlement when it reaches a bet from the current block. That avoids using an unavailable `blockhash` and makes the queue semantics explicit.

## Payout and refund safety model

### Refunds

If a pending bet ages beyond the 256-block `blockhash` window, the user receives a claim for the post-fee `netAmount`, not the gross amount. This keeps fee accounting deterministic and matches the core economic behavior carried forward from the original `EthexLoto` flow.

### Payouts

If a `blockhash` is available, the contract computes the weighted payout from the matched cells and credits the result to the user's claimable balance.

### Claims

Claims follow a pull model:

1. Read `claimableBalances[msg.sender]`
2. Zero out the user's claimable amount
3. Decrease `totalClaimable`
4. Send ETH with `call`

This keeps settlement free from recipient-side transfer failures and narrows the external-call surface.

## Accounting invariants

The contract's solvency posture relies on explicit buckets:

- `reservedExposure`
- `houseFeesAccrued`
- `totalClaimable`

The key invariant is:

`reservedExposure + houseFeesAccrued + totalClaimable <= address(this).balance`

That invariant is not just documented; it is exercised by the current invariant test suite.

## Liquidity reservation logic

Each pending bet reserves its full `maxPayout` up front. This is conservative and intentionally simple.

Benefits:

- New bets cannot overcommit the contract
- Refunds and claims remain separate from exposure accounting
- The solvency model is easy to verify in tests

Tradeoff:

- The contract may reject bets more aggressively than a more capital-efficient design

For an assessment submission, that tradeoff is reasonable because it favors clarity and safety over optimization.

## External call strategy

The current contract only makes external ETH calls in two places:

- `claim()`
- `withdrawHouseFees()`

In both cases, internal accounting is updated before the call. That follows the checks-effects-interactions pattern and keeps failure modes contained.

## Legacy patterns intentionally removed

The modernization deliberately removed or avoided:

- `tx.origin` gating
- `send` plus self-destruct fallback delivery patterns
- multi-contract fee routing
- version migration logic
- ambiguous packed bet encoding

These choices were driven by reviewability and safety, not just style preference.

## Known risks intentionally accepted

- Randomness still depends on `blockhash`, which is acceptable for this assessment but not ideal for a production wagering product.
- Settlement is permissionless but not automated; someone must call `settleBets`.
- Owner fee withdrawals are trusted within the amount tracked by `houseFeesAccrued`.
- Liquidity must be prefunded manually through `fundLiquidity()`.

Those risks are acceptable in the current repo because they are explicit, small in scope, and easy to reason about.

## Limitations due to scope

Because jackpot and superprize systems were intentionally removed, this repo does not cover:

- pooled side-prize accounting
- cross-contract migration safety
- operator workflows for multiple prize contracts

That is a limitation of scope, but it is also a deliberate simplification that keeps the core assessment readable.

## What I would improve next in production

- Replace `blockhash`-based outcome generation with a stronger randomness source
- Add a reentrancy guard even though the current external call surface is small
- Add explicit pause / circuit-breaker controls if operating with larger capital
- Add operational monitoring around settlement lag and liquidity headroom
