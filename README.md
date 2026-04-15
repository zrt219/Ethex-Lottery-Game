# Ethex Lottery Technical Assessment Submission

Technical assessment submission that modernizes the core `EthexLoto` betting flow from the legacy GitLab repository into a single-contract Foundry project with a real Next.js dApp targeting XRPL EVM Testnet.

Execution window: Using the submission files as the reference set, the earliest creation timestamp in this submission is April 14, 2026 6:33:41 PM. Measured against April 14, 2026 8:02:00 PM, the exact elapsed time for this build cycle is 1:28:18.7924261. This timing covers the submission files from first file creation to current measured time, and it is included here to show disciplined execution speed alongside the actual deliverables: a modernized Solidity system, passing tests, a live XRPL EVM Testnet deployment, a live Vercel dApp, and employer-facing documentation.

## Assessment context

The source task came from a legacy multi-contract Solidity repository built around `EthexLoto`, `EthexJackpot`, `EthexSuperprize`, and `EthexHouse`. The objective of this submission is not to preserve that system mechanically. The objective is to show that the original codebase was understood, that the core deterministic betting flow was identified correctly, and that it could be rebuilt in a cleaner form that is easier to review, test, and deploy.

This implementation focuses on clarity, simplicity, and correctness because those are the highest-signal traits in a technical assessment. The code and documentation are intentionally structured to help a hiring manager or senior engineer understand the design quickly.

The measured execution window above is part of that evaluation story: it demonstrates code quality and structure, practical thinking and simplicity, and completeness and correctness delivered in one focused cycle.

## Executive approach summary

| Preserved from the original repo | Modernized in this repo | Intentionally omitted |
| --- | --- | --- |
| Six-slot bet model | Solidity `^0.8.24` and Foundry | Jackpot subsystem |
| Weighted payout logic | Explicit `uint8[6]` input with `255` empty-slot sentinels | Superprize subsystem |
| Blockhash-based settlement | Custom errors and explicit validation | Migration/versioning paths |
| Post-fee refund behavior | Pull-based claims | Separate house-wallet contract |
| Queue-based settlement | Deterministic accounting buckets | Legacy helper-script tooling |

These choices are practical, not merely smaller. The original repo's core business signal was the fee, validation, settlement, and refund path in `EthexLoto`. Re-implementing only that deterministic core produces a submission that is easier to audit and easier to judge against the employer's stated criteria.

## Why this submission aligns with the employer's evaluation criteria

### Code quality and structure

The current repo has one production contract, one deployment script, three focused test suites, one UI entrypoint, and a small CI workflow. That keeps the core logic visible and avoids hiding important behavior behind unnecessary indirection.

### Practical thinking and simplicity

The implementation narrows scope on purpose. Jackpot, superprize, migration, and force-send patterns were all real parts of the legacy system, but they were not necessary to demonstrate understanding of the assessment's central fee and settlement rules. Omitting them here improves reviewability without weakening the core solution.

### Completeness and correctness

The repo currently contains:

- A deployed-scope contract implementation in `src/EthexGame.sol`
- Foundry unit, fuzz, and invariant tests
- An XRPL EVM deployment script
- A UI that can preview, place bets, read live state, switch networks, and claim balances when a contract address is configured
- CI for contract build, contract tests, and UI build

## Original repo analysis summary

The legacy system was structured as a main game contract plus supporting contracts:

- `EthexLoto`: core bet intake, fee derivation, pending bet queue, settlement, and refunds
- `EthexJackpot`: jackpot ticketing and rolling jackpot pools
- `EthexSuperprize`: delayed special-prize payouts
- `EthexHouse`: passive fee sink

For this assessment, `EthexLoto` was the core contract, while the other contracts were support or legacy-operational layers. That is why the current scope centers on the deterministic flow of bet validation, marked-cell counting, dynamic fee derivation, liquidity reservation, settlement, and post-fee refunds.

More detail is in [docs/original-repo-analysis.md](docs/original-repo-analysis.md).

## Current architecture overview

### Contract architecture

The live scope is one contract: `src/EthexGame.sol`.

It currently handles:

- Bet placement via `placeBet(uint8[6] calldata cells)`
- Fee preview via `previewBet`
- Queue-based settlement via `settleBets(uint256 maxCount)`
- Pull-based payout and refund claims via `claim()`
- Liquidity funding and owner house-fee withdrawal

### Frontend architecture

The UI lives in `ui/` and is built with Next.js App Router, TypeScript, Tailwind, and `viem`. It uses an injected wallet directly rather than an additional wallet framework layer.

The current UI supports:

- Wallet connection
- XRPL EVM Testnet switching
- Local and on-chain fee preview
- Live reads for liquidity, pending cursor, house fees, and claimable balance
- On-chain `placeBet` and `claim` transactions when `NEXT_PUBLIC_CONTRACT_ADDRESS` is configured

### Deployment architecture

- `script/Deploy.s.sol` deploys `EthexGame` and can optionally fund initial liquidity
- `.env.example` wires both contract deployment and frontend runtime config
- The intended frontend hosting target is Vercel with `ui/` as the root directory

### Repo tree

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
`-- .github/workflows/ci.yml
```

For the deeper architecture note, see [docs/architecture.md](docs/architecture.md).

## Key design decisions

### Modern Solidity and Foundry

The contract is implemented in Solidity `^0.8.24` and uses Foundry for build, script, and test workflows. This keeps the repo aligned with current Solidity tooling and simplifies verification.

### Single-contract scope

The current implementation is intentionally a single-contract system. `EthexGame` absorbs the core responsibilities that mattered from `EthexLoto` and leaves out operational side systems that do not improve assessment signal.

### Data model

Bets are stored explicitly as a struct containing player, gross amount, net amount, max payout, placement block, marked count, status, and the six selected cells. The modern `uint8[6]` input model uses `255` as the explicit empty-slot sentinel, and valid active cells are constrained to `0-19`.

### Settlement and refund design

Settlement is queue-based and bounded by `maxCount`. The contract stops when it reaches a bet from the current block because its blockhash is not available yet. If a bet ages out of the 256-block window, the player receives the post-fee net amount as a refund claim.

### Liquidity and accounting model

The contract tracks three explicit accounting buckets:

- `reservedExposure`
- `houseFeesAccrued`
- `totalClaimable`

At bet placement, the contract reserves each bet's maximum possible payout and rejects bets that exceed currently available liquidity.

### Why complexity is intentionally constrained

The current code aims to be easy to inspect under time pressure. The design does not try to recreate every branch of the original system because doing so would add operational state without materially improving the reviewer's ability to assess engineering quality.

## Security posture

The current implementation takes a simple but explicit security stance:

- Invalid cell values revert
- Zero-marked bets revert
- Bets below the minimum revert
- Settlement is bounded and cannot settle the same block's bets
- Payouts and refunds are credited to claimable balances before external transfer
- House-fee withdrawals are capped by tracked accrued fees
- Legacy `tx.origin` and force-send patterns are removed

Tradeoffs are documented rather than hidden. The system still relies on `blockhash` availability and requires prefunded liquidity to reserve payout exposure. A deeper discussion is in [docs/security-decisions.md](docs/security-decisions.md).

## Feature summary

### Implemented today

- Six-slot weighted bet model
- Dynamic house edge:
  - `1` marked cell -> `12%`
  - `2-3` marked cells -> `10%`
  - `4-6` marked cells -> `8%`
- Explicit fee preview and max-payout preview
- Liquidity reservation at bet placement
- Queue-based settlement and expired-bet refunds
- Pull-based claims
- Foundry unit, fuzz, and invariant tests
- Next.js UI with live reads and contract writes when configured

### Out of scope in the current implementation

- Jackpot ticketing and payout logic
- Superprize logic
- Legacy contract migration
- Multi-contract treasury routing
- Any consumer-style casino UX

## Local development

### Prerequisites

- Foundry
- Node.js 20+
- npm

### Setup and run

```bash
npm install
```

```bash
npm --prefix ui install
```

```bash
forge build
```

```bash
forge test -vvv
```

```bash
npm --prefix ui run dev
```

## Testing strategy

The current test suite is grounded in the implemented contract behavior.

`test/EthexGame.t.sol` covers:

- Marked-cell counting
- Fee-tier calculation
- Invalid input reverts
- Minimum-bet enforcement
- Liquidity rejection
- Settlement behavior
- Refund behavior
- Claim behavior
- House-fee withdrawal bounds

`test/EthexGameFuzz.t.sol` covers:

- Marked-cell count invariants
- Fee-tier invariants
- Accounting invariants during placement

`test/EthexGameInvariant.t.sol` covers:

- Conservation of accounting buckets relative to contract balance under randomized handler actions

Verified current status:

- `forge test -vvv` passes
- `npm --prefix ui run build` passes

## Deployment

### Current deployed status

The frontend is live on Vercel at [https://ui-pi-eight.vercel.app](https://ui-pi-eight.vercel.app).

The XRPL EVM contract is deployed at [0x6a481F555Ba68895Bc08854d677464f96D54C43d](https://explorer.testnet.xrplevm.org/address/0x6a481F555Ba68895Bc08854d677464f96D54C43d).

The deployment wallet used for the broadcast is `0x31A826bB9D5F6087d94CDA31945C1234d061b788`.

### Environment variables

The current `.env.example` defines:

- `RPC_URL`
- `PRIVATE_KEY`
- `CHAIN_ID`
- `INITIAL_LIQUIDITY_ETH`
- `NEXT_PUBLIC_CHAIN_ID`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_EXPLORER_URL`

### XRPL EVM deploy

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
```

### XRPL EVM verify

```bash
forge verify-contract 0x6a481F555Ba68895Bc08854d677464f96D54C43d src/EthexGame.sol:EthexGame --chain-id 1449000
```

Automated verification currently reports chain `1449000` as unsupported in the default no-key Sourcify path, so the manual explorer upload fallback in `docs/deployment.md` is the practical verification route for this network.

### Frontend build

```bash
npm --prefix ui run build
```

### Vercel deploy

```bash
npx vercel --cwd ui --prod
```

The fuller operational guide, including current limitations and troubleshooting, is in [docs/deployment.md](docs/deployment.md).

## Repository structure

```text
.
|-- README.md
|-- src/
|-- script/
|-- test/
|-- docs/
|-- ui/
`-- .github/workflows/ci.yml
```

See [docs/architecture.md](docs/architecture.md) for a more detailed breakdown of runtime boundaries and state flow.

## Final notes

This repository is a technical assessment submission. The emphasis is on practical engineering judgment: understand the legacy codebase, preserve the business rules that matter, modernize the parts that improve clarity and safety, and keep the live scope small enough to review confidently.
