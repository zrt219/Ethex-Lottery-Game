# Deployment Guide

## Summary

This repository is wired for one Foundry deployment to XRPL EVM Testnet and one Vercel deployment from the `ui/` subdirectory.

The deployment work sits inside the same measured submission window used throughout the assessment framing: April 14, 2026 6:33:41 PM to April 14, 2026 8:02:00 PM, for an exact elapsed time of 1:28:18.7924261. Within that window, the repo reached a live XRPL EVM Testnet contract and a live Vercel frontend, which is the practical endpoint this submission was meant to demonstrate.

## Network configuration

XRPL EVM Testnet values used by this submission:

- Network: `XRPL EVM Testnet`
- Chain ID: `1449000`
- RPC URL: `https://rpc.testnet.xrplevm.org/`
- Explorer: `https://explorer.testnet.xrplevm.org/`

## Current live status

- Frontend production URL: [https://ui-pi-eight.vercel.app](https://ui-pi-eight.vercel.app)
- Deployment wallet: `0x31A826bB9D5F6087d94CDA31945C1234d061b788`
- XRPL EVM contract address: [0x6a481F555Ba68895Bc08854d677464f96D54C43d](https://explorer.testnet.xrplevm.org/address/0x6a481F555Ba68895Bc08854d677464f96D54C43d)

The contract deployment has completed successfully. The repo now has a live XRPL EVM Testnet contract address to verify and a frontend deployment that can be wired to it.

## Environment configuration

Expected root `.env` values:

```bash
RPC_URL=https://rpc.testnet.xrplevm.org/
PRIVATE_KEY=<testnet_private_key>
CHAIN_ID=1449000
INITIAL_LIQUIDITY_ETH=1
NEXT_PUBLIC_CHAIN_ID=1449000
NEXT_PUBLIC_RPC_URL=https://rpc.testnet.xrplevm.org/
NEXT_PUBLIC_CONTRACT_ADDRESS=<deployed_contract_address>
NEXT_PUBLIC_EXPLORER_URL=https://explorer.testnet.xrplevm.org/
```

Do not commit private keys. The assessment key should be treated as disposable testnet-only material.

## One-line commands

### Build

```bash
forge build
```

### Test

```bash
forge test -vvv
```

### Deploy

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
```

### Verify

```bash
forge verify-contract $CONTRACT_ADDRESS src/EthexGame.sol:EthexGame --chain-id $CHAIN_ID
```

### Run frontend locally

```bash
npm --prefix ui run dev
```

### Deploy frontend to Vercel

```bash
npx vercel --cwd ui --prod
```

## Verification notes

Primary path:

- Use `forge verify-contract` against the deployed `EthexGame` address once the wallet is funded and deployment succeeds.
- The default no-key Sourcify route currently reports chain `1449000` as unsupported, so automated verification is not available on this network today.

Fallback path if explorer API verification is unreliable:

- export the standard JSON input from the Foundry build output
- open the XRPL EVM Testnet explorer verification page
- submit the exact compiler version, optimizer settings, contract path, contract name, and constructor arguments used during deployment
- this is the route to use for this repo's current deployment

## Post-deploy checklist

- record deployed `EthexGame` address in `README.md`
- add the XRPL explorer address link to `README.md`
- set `NEXT_PUBLIC_CONTRACT_ADDRESS`
- confirm the frontend is pointed at XRPL EVM Testnet
- redeploy `ui/` to Vercel if configuration changes

## Vercel project setup

Recommended Vercel settings:

- Framework preset: `Next.js`
- Root directory: `ui`
- Install command: `npm install`
- Build command: `npm run build`

Required frontend environment variables:

- `NEXT_PUBLIC_CHAIN_ID`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_EXPLORER_URL`

## GitHub push commands

If GitHub authentication is available:

```bash
git add . && git commit -m "Build assessment submission" && git push origin main
```

If the remote is not configured locally:

```bash
git remote add origin https://github.com/zrt219/Ethex-Lottery-Game.git && git branch -M main && git push -u origin main
```
