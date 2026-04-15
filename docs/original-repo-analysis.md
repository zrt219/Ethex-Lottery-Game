# Original Repo Analysis

## Summary

The GitLab source repository was analyzed as business-context reference, not as an implementation baseline. The important conclusion was that `EthexLoto` contained the core deterministic game flow, while the surrounding contracts added prize, treasury, and migration complexity that was not necessary for a clean assessment submission.

The submission timeline reflects that decision: the files in this repo were created between April 14, 2026 6:33:41 PM and April 14, 2026 8:02:00 PM, for an exact elapsed time of 1:28:18.7924261. That speed came from preserving the core business logic and omitting the legacy side systems that would have added scope without improving the assessment signal.

## Legacy repository structure

The original Solidity system centered on several contracts with distinct roles:

- `EthexLoto`: main betting contract
- `EthexJackpot`: jackpot registration and rolling-pool payout logic
- `EthexSuperprize`: delayed special-prize payouts
- `EthexHouse`: house-fee sink
- migration and support contracts around older versions and payout delivery

That structure matters because it shows the difference between business-critical logic and historical operational layering.

## Relevant legacy contracts and apparent roles

### `EthexLoto`

This was the contract that mattered most for the assessment.

It handled:

- bet intake
- packed bet decoding
- marked-cell counting
- fee handling
- hold / exposure calculation
- queued settlement
- refund behavior when the placement blockhash expired

### `EthexJackpot`

This contract handled side-ticket registration and periodic jackpot payouts. It represented real business logic, but not logic that was necessary to demonstrate the dynamic fee and deterministic settlement task.

### `EthexSuperprize`

This contract managed a separate special-prize flow with delayed installment payouts. It was operationally interesting, but orthogonal to the core fee and queue-settlement behavior.

### `EthexHouse`

This contract was primarily a passive bucket for house fees. In a modernized single-contract assessment scope, that extra contract boundary adds more ceremony than value.

## Preserve / modernize / omit matrix

| Legacy element | Decision in current repo | Rationale |
| --- | --- | --- |
| Six-slot bet composition | Preserve | It is central to the original game model and still understandable to a reviewer. |
| Weighted payout model | Preserve | It retains the original business intent around exact versus category matches. |
| Blockhash-based settlement | Preserve | It is part of the original deterministic flow and supports the refund logic. |
| Post-fee refund behavior | Preserve | It is economically important and tested directly in the current repo. |
| Packed `bytes22` bet encoding | Modernize | Explicit `uint8[6]` input is easier to audit and easier to integrate from the UI. |
| Old Solidity and Truffle patterns | Modernize | Foundry and Solidity `^0.8.24` improve readability, testing, and safety. |
| Implicit failure cases | Modernize | Custom errors and explicit validation make the system easier to reason about. |
| Direct-send payout behavior | Modernize | Pull-based claims reduce settlement-side transfer risk. |
| Jackpot subsystem | Omit | It adds significant state and complexity without improving the core assessment signal. |
| Superprize subsystem | Omit | It is not needed to demonstrate the main fee and settlement design. |
| Separate house-fee contract | Omit | House fees can be tracked explicitly inside one contract. |
| Migration/versioning support | Omit | It is historical baggage for this repo's scope. |

## Why these simplifications are practical engineering, not incomplete work

The current scope is not a shortcut around the hard part of the task. It is a narrowing onto the hard part that matters:

- correct fee derivation
- explicit validation
- deterministic accounting
- settlement safety
- expired-bet refunds
- frontend clarity

A full legacy recreation would have made the repo larger, but not more persuasive. The current implementation demonstrates selective judgment: preserve the business rules that matter, modernize the parts that improve clarity, and omit the systems that mostly add historical complexity.

## Low-trust legacy repo elements that affected modernization choices

The legacy repo was useful to read, but not trustworthy enough to reuse directly.

During analysis, the following issues materially affected modernization choices:

- unresolved README conflict markers
- outdated Solidity and Truffle-era patterns
- suspicious helper-script content outside the contract code
- migration-heavy contract relationships that would distract from the core assessment

Those observations reinforced a clean-rebuild approach rather than a porting approach.

## Input model note

The original repository used packed bet encoding. The modern implementation replaces that with explicit `uint8[6]` input and uses `255` as the empty-slot sentinel so the six-cell model stays readable without losing the marked-versus-unmarked distinction.
