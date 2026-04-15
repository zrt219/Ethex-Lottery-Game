import { Address, isAddress, parseAbi } from "viem";
import { defineChain } from "viem";

export const xrplChain = defineChain({
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 1449000),
  name: "XRPL EVM Testnet",
  nativeCurrency: {
    name: "XRP",
    symbol: "XRP",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.testnet.xrplevm.org"]
    }
  },
  blockExplorers: {
    default: {
      name: "XRPL Explorer",
      url: process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://explorer.testnet.xrplevm.org"
    }
  },
  testnet: true
});

const configuredAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

export const contractAddress =
  configuredAddress && isAddress(configuredAddress) ? (configuredAddress as Address) : undefined;

export const isContractConfigured = Boolean(contractAddress);

export const ethexGameAbi = parseAbi([
  "function placeBet(uint8[6] cells) payable returns (uint256 betId)",
  "function claim()",
  "function claimable(address user) view returns (uint256)",
  "function availableLiquidity() view returns (uint256)",
  "function houseFeesAccrued() view returns (uint256)",
  "function pendingCursor() view returns (uint256 nextUnsettledBetId, uint256 nextBetId)",
  "function previewBet(uint8[6] cells, uint256 amount) view returns (uint8 markedCount, uint16 houseEdgeBps, uint256 houseFee, uint256 netAmount, uint256 maxPayout)"
]);

export function explorerAddressUrl(address: Address) {
  return `${xrplChain.blockExplorers.default.url}/address/${address}`;
}

export function explorerTxUrl(hash: `0x${string}`) {
  return `${xrplChain.blockExplorers.default.url}/tx/${hash}`;
}
