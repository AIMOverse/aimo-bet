export const UNIFIED_CATEGORIES = {
  crypto: {
    label: "Crypto",
    kalshi: ["Crypto"],
    polymarket: ["crypto", "bitcoin", "ethereum"],
  },
  politics: {
    label: "Politics",
    kalshi: ["Politics", "Elections"],
    polymarket: ["politics", "elections"],
  },
  sports: {
    label: "Sports",
    kalshi: ["Sports"],
    polymarket: ["sports"],
  },
} as const;

export type UnifiedCategory = keyof typeof UNIFIED_CATEGORIES;

export function getKalshiCategories(category: UnifiedCategory): string[] {
  return [...UNIFIED_CATEGORIES[category].kalshi];
}

export function getPolymarketTags(category: UnifiedCategory): string[] {
  return [...UNIFIED_CATEGORIES[category].polymarket];
}

export function getAllUnifiedCategories(): UnifiedCategory[] {
  return Object.keys(UNIFIED_CATEGORIES) as UnifiedCategory[];
}
