// ============================================================================
// AI Tools - Prediction Market Trading Tools
// ============================================================================

// Market Discovery - Multi-exchange unified discovery
export {
  discoverMarketTool,
  discoverMarketFromKalshiTool,
  discoverMarketFromPolymarketTool,
  UNIFIED_CATEGORIES,
  getKalshiCategories,
  getPolymarketTags,
  getAllUnifiedCategories,
} from "./discover";

export type {
  UnifiedMarket,
  UnifiedCategory,
  Exchange,
  CompositeCursor,
  DiscoverMarketResult,
  KalshiMarketResult,
  PolymarketMarketResult,
} from "./discover";

// Position Management - creators that accept signer
export {
  createIncreasePositionTool,
  increasePositionTool,
} from "./increasePosition";
export {
  createDecreasePositionTool,
  decreasePositionTool,
} from "./decreasePosition";
export {
  createRetrievePositionTool,
  retrievePositionTool,
} from "./retrievePosition";
export { createRedeemPositionTool, redeemPositionTool } from "./redeemPosition";

// Utilities
export {
  resolveMints,
  getTradeMintsForBuy,
  getTradeMintsForSell,
  getOutcomeMint,
  clearMarketCache,
} from "./utils/resolveMints";
