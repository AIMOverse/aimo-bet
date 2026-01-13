// ============================================================================
// AI Tools - Prediction Market Trading Tools
// ============================================================================

// Market Discovery - Multi-exchange unified discovery
export {
  discoverMarketsTool,
  explainMarketTool,
  UNIFIED_CATEGORIES,
  getKalshiCategories,
  getPolymarketTags,
  getAllUnifiedCategories,
} from "./discover";

export type {
  MarketSummary,
  UnifiedCategory,
  Exchange,
  CompositeCursor,
  DiscoverMarketsResult,
  ExplainMarketResult,
  RawOrderbook,
} from "./discover";

// Trade Tools - Multi-exchange trading
export {
  createPlaceMarketOrderTool,
  placeMarketOrderTool,
  createPlaceLimitOrderTool,
  placeLimitOrderTool,
  createCancelLimitOrderTool,
  cancelLimitOrderTool,
} from "./trade";

export type {
  OrderSide,
  Outcome,
  OrderType,
  TimeInForce,
  OrderStatus,
  PlaceOrderInput,
  PlaceOrderResult,
  CancelOrderInput,
  CancelOrderResult,
} from "./trade";

// Management Tools - Multi-exchange portfolio management
export {
  createGetBalanceTool,
  getBalanceTool,
  createGetPositionsTool,
  getPositionsTool,
  createWithdrawToSolanaTool,
  withdrawToSolanaTool,
} from "./management";

export type {
  Exchange as ManagementExchange,
  Signer,
  ToolSigners,
  ChainBalance,
  GetBalanceResult,
  Position,
  PositionSummary,
  GetPositionsResult,
  WithdrawSigners,
  WithdrawResult,
  QuoteResult,
} from "./management";

// Analysis Tools - Parallel AI powered research
export {
  webSearchTool,
  createWebSearchTool,
  deepResearchTool,
  createDeepResearchTool,
} from "./analysis";

export type {
  WebSearchInput,
  WebSearchOutput,
  DeepResearchInput,
  DeepResearchOutput,
} from "./analysis";

// Utilities - Re-export from dflow layer for convenience
export {
  resolveMints,
  getTradeMintsForBuy,
  getTradeMintsForSell,
  getOutcomeMint,
  clearMarketCache,
} from "@/lib/prediction-market/kalshi/dflow/resolveMints";
