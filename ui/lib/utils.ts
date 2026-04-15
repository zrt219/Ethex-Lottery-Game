import { formatEther } from "viem";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function formatShortAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatCurrency(value: bigint) {
  const amount = Number(formatEther(value));

  if (!Number.isFinite(amount)) {
    return "Unavailable";
  }

  return `${amount.toLocaleString(undefined, {
    maximumFractionDigits: 6
  })} ETH`;
}

export function formatBps(value: number) {
  return `${(value / 100).toFixed(0)}%`;
}
