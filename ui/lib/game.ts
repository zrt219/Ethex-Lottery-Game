export const EMPTY_CELL_VALUE = 255;
const ANY_LETTER_VALUE = 16;
const ANY_DIGIT_VALUE = 17;
const ODD_DIGIT_VALUE = 18;
const EVEN_DIGIT_VALUE = 19;

type BetOption = {
  label: string;
  value: string;
  weight: number;
  active: boolean;
};

export const BET_OPTIONS: BetOption[] = [
  { label: "Inactive", value: String(EMPTY_CELL_VALUE), weight: 0, active: false },
  ...Array.from({ length: 16 }, (_, value) => ({
    label: `Exact ${value.toString(16).toUpperCase()}`,
    value: String(value),
    weight: 30,
    active: true
  })),
  { label: "Any letter (A-F)", value: String(ANY_LETTER_VALUE), weight: 5, active: true },
  { label: "Any digit (0-9)", value: String(ANY_DIGIT_VALUE), weight: 3, active: true },
  { label: "Odd digit", value: String(ODD_DIGIT_VALUE), weight: 6, active: true },
  { label: "Even digit", value: String(EVEN_DIGIT_VALUE), weight: 6, active: true }
];

export type BuildPreviewResult = {
  preview: {
    markedCount: number;
    houseEdgeBps: number;
    houseFee: bigint;
    netAmount: bigint;
    maxPayout: bigint;
  };
  isValid: boolean;
  error?: string;
};

export function countMarkedSelections(cells: string[]) {
  return cells.filter((value) => Number(value) !== EMPTY_CELL_VALUE).length;
}

export function toContractCells(cells: string[]) {
  return cells.map((value) => Number(value)) as [number, number, number, number, number, number];
}

export function buildPreview(cells: string[], amount?: bigint): BuildPreviewResult {
  const markedCount = countMarkedSelections(cells);
  const selectedWeights = cells.reduce((total, value) => total + getWeight(Number(value)), 0);
  const houseEdgeBps = getHouseEdge(markedCount);
  const safeAmount = amount ?? 0n;

  if (amount === undefined) {
    return {
      preview: {
        markedCount,
        houseEdgeBps,
        houseFee: 0n,
        netAmount: 0n,
        maxPayout: 0n
      },
      isValid: false,
      error: "Enter a valid ETH amount."
    };
  }

  if (safeAmount < 10_000_000_000_000_000n) {
    return {
      preview: {
        markedCount,
        houseEdgeBps,
        houseFee: 0n,
        netAmount: 0n,
        maxPayout: 0n
      },
      isValid: false,
      error: "Minimum bet is 0.01 ETH."
    };
  }

  if (markedCount === 0) {
    return {
      preview: {
        markedCount,
        houseEdgeBps,
        houseFee: 0n,
        netAmount: 0n,
        maxPayout: 0n
      },
      isValid: false,
      error: "Select at least one marked cell."
    };
  }

  const invalid = cells.some((value) => {
    const numericValue = Number(value);
    return numericValue !== EMPTY_CELL_VALUE && (Number.isNaN(numericValue) || numericValue < 0 || numericValue > 19);
  });

  if (invalid) {
    return {
      preview: {
        markedCount,
        houseEdgeBps,
        houseFee: 0n,
        netAmount: 0n,
        maxPayout: 0n
      },
      isValid: false,
      error: "One or more cell values are outside the supported range."
    };
  }

  const houseFee = (safeAmount * BigInt(houseEdgeBps)) / 10_000n;
  const netAmount = safeAmount - houseFee;
  const maxPayout = (netAmount * BigInt(selectedWeights) * 8n) / (15n * BigInt(markedCount));

  return {
    preview: {
      markedCount,
      houseEdgeBps,
      houseFee,
      netAmount,
      maxPayout
    },
    isValid: true
  };
}

export function formatSelection(cells: string[]) {
  const active = cells
    .map((value, index) => ({ value: Number(value), index }))
    .filter((item) => item.value !== EMPTY_CELL_VALUE)
    .map((item) => `#${item.index + 1}: ${labelForValue(item.value)}`);

  if (active.length === 0) {
    return "No active cells selected yet.";
  }

  return active.join(" | ");
}

function getHouseEdge(markedCount: number) {
  if (markedCount <= 0) return 0;
  if (markedCount === 1) return 1200;
  if (markedCount <= 3) return 1000;
  return 800;
}

function getWeight(value: number) {
  if (value === EMPTY_CELL_VALUE) return 0;
  if (value >= 0 && value <= 15) return 30;
  if (value === ANY_LETTER_VALUE) return 5;
  if (value === ANY_DIGIT_VALUE) return 3;
  if (value === ODD_DIGIT_VALUE || value === EVEN_DIGIT_VALUE) return 6;
  return 0;
}

function labelForValue(value: number) {
  if (value >= 0 && value <= 15) return `Exact ${value.toString(16).toUpperCase()}`;
  if (value === ANY_LETTER_VALUE) return "Any letter";
  if (value === ANY_DIGIT_VALUE) return "Any digit";
  if (value === ODD_DIGIT_VALUE) return "Odd digit";
  if (value === EVEN_DIGIT_VALUE) return "Even digit";
  return "Inactive";
}
