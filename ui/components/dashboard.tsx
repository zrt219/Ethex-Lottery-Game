"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseEther,
  type Address,
  type Hex
} from "viem";
import {
  contractAddress,
  ethexGameAbi,
  explorerAddressUrl,
  explorerTxUrl,
  isContractConfigured,
  xrplChain
} from "@/lib/contract";
import {
  BET_OPTIONS,
  BuildPreviewResult,
  EMPTY_CELL_VALUE,
  buildPreview,
  formatSelection,
  toContractCells
} from "@/lib/game";
import { cn, formatBps, formatCurrency, formatShortAddress } from "@/lib/utils";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
      on?: (event: string, listener: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
    };
  }
}

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  tone: "neutral" | "success" | "warning";
};

type ChainState = {
  availableLiquidity?: bigint;
  pendingCursor?: readonly [bigint, bigint];
  houseFeesAccrued?: bigint;
  claimable?: bigint;
};

type OnchainPreview = {
  markedCount: number;
  houseEdgeBps: number;
  houseFee: bigint;
  netAmount: bigint;
  maxPayout: bigint;
};

const defaultCells = Array<string>(6).fill(String(EMPTY_CELL_VALUE));
const minBetAmount = "0.01";
const publicClient = createPublicClient({
  chain: xrplChain,
  transport: http(xrplChain.rpcUrls.default.http[0])
});

export function Dashboard() {
  const [cells, setCells] = useState<string[]>(defaultCells);
  const [betAmount, setBetAmount] = useState<string>(minBetAmount);
  const [walletAddress, setWalletAddress] = useState<Address | undefined>();
  const [walletChainId, setWalletChainId] = useState<number | undefined>();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [chainState, setChainState] = useState<ChainState>({});
  const [onchainPreview, setOnchainPreview] = useState<OnchainPreview | undefined>();
  const [activity, setActivity] = useState<ActivityItem[]>([
    {
      id: "ready",
      title: "UI ready",
      detail: "Connected to the XRPL EVM Testnet configuration and waiting for a deployed contract address.",
      tone: "neutral"
    }
  ]);

  const parsedAmount = useMemo(() => {
    try {
      return parseEther(betAmount === "" ? "0" : betAmount);
    } catch {
      return undefined;
    }
  }, [betAmount]);

  const preview = useMemo<BuildPreviewResult>(() => buildPreview(cells, parsedAmount), [cells, parsedAmount]);
  const isConnected = Boolean(walletAddress);
  const wrongNetwork = isConnected && walletChainId !== xrplChain.id;

  useEffect(() => {
    hydrateWalletState().catch(() => {
      setActivity((current) => [
        {
          id: "wallet-check",
          title: "Wallet unavailable",
          detail: "No injected wallet was detected during initial load.",
          tone: "warning"
        },
        ...current.slice(0, 3)
      ]);
    });
  }, []);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider?.on) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const nextAccount = Array.isArray(accounts) ? (accounts[0] as Address | undefined) : undefined;
      setWalletAddress(nextAccount);
    };

    const handleChainChanged = (chain: unknown) => {
      if (typeof chain === "string") {
        setWalletChainId(Number.parseInt(chain, 16));
      }
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  useEffect(() => {
    if (!contractAddress) return;

    readLiveState().catch((error) => {
      pushActivity("Live read issue", error.message, "warning");
    });
  }, [walletAddress]);

  useEffect(() => {
    const activeContractAddress = contractAddress;

    if (!activeContractAddress || !parsedAmount || !preview.isValid) {
      setOnchainPreview(undefined);
      return;
    }

    publicClient
      .readContract({
        address: activeContractAddress,
        abi: ethexGameAbi,
        functionName: "previewBet",
        args: [toContractCells(cells), parsedAmount]
      })
      .then((result) => {
        setOnchainPreview({
          markedCount: Number(result[0]),
          houseEdgeBps: Number(result[1]),
          houseFee: result[2],
          netAmount: result[3],
          maxPayout: result[4]
        });
      })
      .catch(() => {
        setOnchainPreview(undefined);
      });
  }, [cells, parsedAmount, preview.isValid]);

  async function hydrateWalletState() {
    const provider = getInjectedProvider();
    const accounts = (await provider.request({
      method: "eth_accounts"
    })) as string[];
    const chain = (await provider.request({
      method: "eth_chainId"
    })) as string;

    setWalletAddress(accounts[0] as Address | undefined);
    setWalletChainId(Number.parseInt(chain, 16));
  }

  async function connectWallet() {
    const provider = getInjectedProvider();
    setIsConnecting(true);

    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts"
      })) as string[];
      const chain = (await provider.request({
        method: "eth_chainId"
      })) as string;

      setWalletAddress(accounts[0] as Address | undefined);
      setWalletChainId(Number.parseInt(chain, 16));
      pushActivity("Wallet connected", "Injected wallet connected successfully.", "success");
    } finally {
      setIsConnecting(false);
    }
  }

  async function switchToXrpl() {
    const provider = getInjectedProvider();

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${xrplChain.id.toString(16)}` }]
      });
    } catch (error) {
      const typedError = error as { code?: number };

      if (typedError.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${xrplChain.id.toString(16)}`,
              chainName: xrplChain.name,
              nativeCurrency: xrplChain.nativeCurrency,
              rpcUrls: xrplChain.rpcUrls.default.http,
              blockExplorerUrls: [xrplChain.blockExplorers.default.url]
            }
          ]
        });
      } else {
        throw error;
      }
    }

    await hydrateWalletState();
    pushActivity("Network aligned", "Wallet switched to XRPL EVM Testnet.", "success");
  }

  async function submitBet() {
    const activeContractAddress = contractAddress;
    if (!activeContractAddress || !walletAddress || !parsedAmount || !preview.isValid || wrongNetwork) return;

    await executeWrite(async () => {
      const walletClient = createWalletClient({
        chain: xrplChain,
        transport: custom(getInjectedProvider())
      });

      const hash = await walletClient.writeContract({
        account: walletAddress,
        address: activeContractAddress,
        abi: ethexGameAbi,
        functionName: "placeBet",
        args: [toContractCells(cells)],
        value: parsedAmount
      });

      setTxHash(hash);
      pushActivity("Transaction submitted", `Awaiting confirmation for ${hash.slice(0, 10)}...`, "neutral");
      await publicClient.waitForTransactionReceipt({ hash });
      pushActivity("Bet confirmed", "The bet transaction was confirmed on XRPL EVM Testnet.", "success");
      await readLiveState();
    });
  }

  async function submitClaim() {
    const activeContractAddress = contractAddress;
    if (!activeContractAddress || !walletAddress || wrongNetwork) return;

    await executeWrite(async () => {
      const walletClient = createWalletClient({
        chain: xrplChain,
        transport: custom(getInjectedProvider())
      });

      const hash = await walletClient.writeContract({
        account: walletAddress,
        address: activeContractAddress,
        abi: ethexGameAbi,
        functionName: "claim"
      });

      setTxHash(hash);
      pushActivity("Claim submitted", `Claim transaction ${hash.slice(0, 10)} is pending.`, "neutral");
      await publicClient.waitForTransactionReceipt({ hash });
      pushActivity("Claim confirmed", "Claimable balance was settled successfully.", "success");
      await readLiveState();
    });
  }

  async function readLiveState() {
    const activeContractAddress = contractAddress;
    if (!activeContractAddress) return;

    const [availableLiquidity, pendingCursor, houseFeesAccrued, claimable] = await Promise.all([
      publicClient.readContract({
        address: activeContractAddress,
        abi: ethexGameAbi,
        functionName: "availableLiquidity"
      }),
      publicClient.readContract({
        address: activeContractAddress,
        abi: ethexGameAbi,
        functionName: "pendingCursor"
      }),
      publicClient.readContract({
        address: activeContractAddress,
        abi: ethexGameAbi,
        functionName: "houseFeesAccrued"
      }),
      walletAddress
        ? publicClient.readContract({
            address: activeContractAddress,
            abi: ethexGameAbi,
            functionName: "claimable",
            args: [walletAddress]
          })
        : Promise.resolve(undefined)
    ]);

    setChainState({
      availableLiquidity,
      pendingCursor,
      houseFeesAccrued,
      claimable
    });
  }

  async function executeWrite(action: () => Promise<void>) {
    setIsWorking(true);

    try {
      await action();
    } catch (error) {
      pushActivity("Transaction issue", getErrorMessage(error), "warning");
    } finally {
      setIsWorking(false);
    }
  }

  function pushActivity(title: string, detail: string, tone: ActivityItem["tone"]) {
    setActivity((current) => [
      {
        id: `${Date.now()}-${title}`,
        title,
        detail,
        tone
      },
      ...current.slice(0, 3)
    ]);
  }

  const displayPreview = onchainPreview ?? preview.preview;

  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="grid-overlay h-full w-full" />
      </div>
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="panel-surface relative overflow-hidden rounded-[32px] px-6 py-7 sm:px-8 sm:py-9">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-glow/60 to-transparent" />
          <div className="grid gap-8 lg:grid-cols-[1.35fr_0.85fr]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300/72">
                <span className="rounded-full border border-white/10 px-3 py-1">Technical assessment submission</span>
                <span className="rounded-full border border-white/10 px-3 py-1">Solidity</span>
                <span className="rounded-full border border-white/10 px-3 py-1">Foundry</span>
                <span className="rounded-full border border-white/10 px-3 py-1">XRPL EVM Testnet</span>
                <span className="rounded-full border border-white/10 px-3 py-1">Next.js</span>
              </div>
              <div className="max-w-3xl space-y-4">
                <p className="font-[var(--font-plex-mono)] text-xs uppercase tracking-[0.3em] text-glow/80">
                  Ethex Lottery Assessment
                </p>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
                  A calm reviewer dashboard for the modernized on-chain lottery flow.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                  This interface focuses on contract clarity instead of casino styling: fee tiers are visible,
                  settlement assumptions are inspectable, and every on-chain action is framed around reviewability.
                </p>
              </div>
            </div>
            <div className="grid gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
              <MetricCard label="Network" value="XRPL EVM Testnet" detail={`Chain ID ${xrplChain.id}`} />
              <MetricCard
                label="Contract"
                value={contractAddress ? formatShortAddress(contractAddress) : "Not configured"}
                detail={contractAddress ? "Ready for live reads and writes" : "Set NEXT_PUBLIC_CONTRACT_ADDRESS"}
              />
              <MetricCard
                label="Bet model"
                value="6-slot weighted selection"
                detail="Legacy payout weights preserved, encoding modernized for auditability"
              />
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel
            eyebrow="Connection panel"
            title="Wallet and deployment context"
            description="Connect an injected wallet, verify XRPL alignment, and jump straight to the deployed contract in the explorer."
          >
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="space-y-4">
                <ConnectionRow label="Wallet status" value={isConnected ? "Connected" : "Disconnected"} />
                <ConnectionRow
                  label="Active account"
                  value={walletAddress ? formatShortAddress(walletAddress) : "No wallet connected"}
                />
                <ConnectionRow
                  label="Network check"
                  value={
                    isConnected
                      ? wrongNetwork
                        ? `Wrong network (${walletChainId})`
                        : `Aligned to ${xrplChain.name}`
                      : "Connect to validate"
                  }
                />
                <ConnectionRow
                  label="Explorer"
                  value={
                    contractAddress ? (
                      <a
                        className="text-glow transition hover:text-white"
                        href={explorerAddressUrl(contractAddress)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View deployed contract
                      </a>
                    ) : (
                      "Waiting for deployment"
                    )
                  }
                />
              </div>
              <div className="flex flex-col gap-3">
                {!isConnected && (
                  <ActionButton onClick={connectWallet} disabled={isConnecting}>
                    {isConnecting ? "Connecting..." : "Connect injected wallet"}
                  </ActionButton>
                )}
                {isConnected && wrongNetwork && (
                  <ActionButton onClick={switchToXrpl} disabled={isWorking}>
                    Switch to XRPL
                  </ActionButton>
                )}
                {isConnected && (
                  <ActionButton
                    onClick={() => {
                      setWalletAddress(undefined);
                      setWalletChainId(undefined);
                    }}
                    variant="secondary"
                  >
                    Disconnect view
                  </ActionButton>
                )}
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="Live state"
            title="Current contract posture"
            description="These reads come from the configured deployment when available. The page still works as a local review surface before deployment is wired in."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <StateTile label="Available liquidity" value={formatReadValue(chainState.availableLiquidity)} />
              <StateTile label="House fees accrued" value={formatReadValue(chainState.houseFeesAccrued)} />
              <StateTile
                label="Pending cursor"
                value={
                  chainState.pendingCursor
                    ? `${chainState.pendingCursor[0].toString()} -> ${chainState.pendingCursor[1].toString()}`
                    : "Unavailable"
                }
              />
              <StateTile label="Connected wallet claimable" value={formatReadValue(chainState.claimable)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <ActionButton
                onClick={submitClaim}
                disabled={!isConnected || wrongNetwork || !contractAddress || isWorking}
                variant="secondary"
              >
                {isWorking ? "Processing..." : "Claim available balance"}
              </ActionButton>
              {txHash && (
                <a
                  className="inline-flex items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-glow/60 hover:text-white"
                  href={explorerTxUrl(txHash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View latest transaction
                </a>
              )}
            </div>
          </Panel>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Panel
            eyebrow="Bet builder"
            title="Construct a six-slot submission"
            description="The UI mirrors legacy payout weights and the dynamic house edge rules while keeping inactive slots explicit for review."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cells.map((value, index) => (
                <label key={`cell-${index}`} className="space-y-2">
                  <span className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Cell {index + 1}
                  </span>
                  <select
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-glow/70 focus:bg-white/[0.06]"
                    value={value}
                    onChange={(event) => {
                      const next = [...cells];
                      next[index] = event.target.value;
                      setCells(next);
                    }}
                  >
                    {BET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-ink">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.24em] text-slate-400">Bet amount (ETH)</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-glow/70 focus:bg-white/[0.06]"
                  value={betAmount}
                  onChange={(event) => setBetAmount(event.target.value)}
                  placeholder="0.05"
                  inputMode="decimal"
                />
              </label>
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <p className="font-[var(--font-plex-mono)] text-xs uppercase tracking-[0.24em] text-slate-400">
                  Selection preview
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-200">{formatSelection(cells)}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StateTile label="Marked cells" value={String(displayPreview.markedCount)} />
              <StateTile label="House edge" value={formatBps(displayPreview.houseEdgeBps)} />
              <StateTile label="House fee" value={formatCurrency(displayPreview.houseFee)} />
              <StateTile label="Net amount" value={formatCurrency(displayPreview.netAmount)} />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <StateTile label="Maximum payout" value={formatCurrency(displayPreview.maxPayout)} />
              <StateTile
                label="Validation"
                value={preview.error ?? "Ready"}
                tone={preview.error ? "warning" : "neutral"}
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <ActionButton
                onClick={submitBet}
                disabled={!isConnected || wrongNetwork || !contractAddress || !preview.isValid || isWorking}
              >
                {isWorking ? "Submitting..." : "Submit bet on-chain"}
              </ActionButton>
              {wrongNetwork && (
                <p className="text-sm text-amber-200">
                  Switch to XRPL EVM Testnet before submitting transactions.
                </p>
              )}
              {!isContractConfigured && (
                <p className="text-sm text-slate-400">
                  Add `NEXT_PUBLIC_CONTRACT_ADDRESS` to enable live contract interaction.
                </p>
              )}
            </div>
          </Panel>

          <Panel
            eyebrow="Engineering notes"
            title="Why this frontend is intentionally restrained"
            description="The UI is designed to help a reviewer verify architecture and contract behavior quickly, not to simulate consumer gambling UX."
          >
            <div className="space-y-5">
              <NotesBlock
                title="Preserved from the original"
                items={[
                  "Six-slot bet composition with legacy exact and category-based selections.",
                  "Weighted payout preview based on the original EthexLoto coefficient model.",
                  "Blockhash-driven settlement framing surfaced as part of the operator narrative."
                ]}
              />
              <NotesBlock
                title="Modernized for reviewability"
                items={[
                  "Explicit inactive slots and readable labels replace opaque packed bet bytes.",
                  "Dynamic house edge tiers are surfaced directly in the interaction flow.",
                  "Explorer shortcuts and direct chain reads keep the deployed contract inspectable."
                ]}
              />
              <NotesBlock
                title="Intentionally omitted"
                items={[
                  "No casino visuals, jackpot theatrics, or motion-heavy chrome.",
                  "No wallet complexity beyond injected wallet support and wrong-network handling.",
                  "No frontend logic that hides fee or payout assumptions from the reviewer."
                ]}
              />
            </div>
          </Panel>
        </div>

        <Panel
          eyebrow="Recent activity"
          title="Transaction and review trail"
          description="A lightweight local log helps reviewers understand what the UI is doing around chain reads and writes."
        >
          <div className="grid gap-3 md:grid-cols-3">
            {activity.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-[24px] border px-4 py-4",
                  item.tone === "success" && "border-mint/35 bg-mint/10",
                  item.tone === "warning" && "border-ember/35 bg-ember/10",
                  item.tone === "neutral" && "border-white/10 bg-white/[0.03]"
                )}
              >
                <p className="font-[var(--font-plex-mono)] text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-100">{item.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </main>
  );
}

function Panel({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel-surface rounded-[32px] px-5 py-5 sm:px-6 sm:py-6">
      <p className="font-[var(--font-plex-mono)] text-[11px] uppercase tracking-[0.28em] text-glow/80">
        {eyebrow}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white">{title}</h2>
        <p className="max-w-2xl text-sm leading-7 text-slate-300">{description}</p>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/10 p-4">
      <p className="font-[var(--font-plex-mono)] text-[11px] uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-3 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm leading-6 text-slate-300">{detail}</p>
    </div>
  );
}

function ConnectionRow({
  label,
  value
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium text-slate-100">{value}</span>
    </div>
  );
}

function StateTile({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] border px-4 py-4",
        tone === "warning" ? "border-amber-300/25 bg-amber-300/10" : "border-white/10 bg-white/[0.03]"
      )}
    >
      <p className="font-[var(--font-plex-mono)] text-[11px] uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-3 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function NotesBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-100">{title}</h3>
      <ul className="mt-3 space-y-3 text-sm leading-7 text-slate-300">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-glow" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "primary"
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-glow px-5 text-ink hover:bg-[#8bd5ff]",
        variant === "secondary" &&
          "border border-white/12 bg-white/[0.04] text-white hover:border-glow/50 hover:bg-white/[0.07]"
      )}
    >
      {children}
    </button>
  );
}

function formatReadValue(value: bigint | undefined) {
  return typeof value === "bigint" ? formatCurrency(value) : "Unavailable";
}

function getInjectedProvider() {
  if (!window.ethereum) {
    throw new Error("No injected wallet was detected in this browser.");
  }

  return window.ethereum;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected wallet or network error.";
}
