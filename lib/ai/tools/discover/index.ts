// Unified tool
export { discoverMarketTool } from "./discoverMarket";

// Exchange-specific tools (for sub-agents)
export { discoverMarketFromKalshiTool } from "./discoverMarketFromKalshi";
export { discoverMarketFromPolymarketTool } from "./discoverMarketFromPolymarket";

// Types
export type {
  CompositeCursor,
  DiscoverMarketResult,
  Exchange,
  KalshiMarketResult,
  PolymarketMarketResult,
  UnifiedCategory,
  UnifiedMarket,
} from "./types";

// Category utilities
export {
  getAllUnifiedCategories,
  getKalshiCategories,
  getPolymarketTags,
  UNIFIED_CATEGORIES,
} from "./categories";
