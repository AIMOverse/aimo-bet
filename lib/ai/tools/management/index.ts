// ============================================================================
// Management Tools Index
// Multi-exchange portfolio management tools
// ============================================================================

// Types
export type {
  Exchange,
  Signer,
  ToolSigners,
  ChainBalance,
  GetBalanceResult,
  Trade,
  TradeSummary,
  GetTradesResult,
  Position,
  PositionSummary,
  GetPositionsResult,
} from "./types";

// Balance Tool
export { createGetBalanceTool, getBalanceTool } from "./getBalance";

// Positions Tool
export { createGetPositionsTool, getPositionsTool } from "./getPositions";

// Trades Tool
export { createGetTradesTool, getTradesTool } from "./getTrades";

// Withdrawal Tool (Polygon -> Solana via Wormhole)
export {
  createWithdrawToSolanaTool,
  withdrawToSolanaTool,
  type WithdrawSigners,
  type WithdrawResult,
  type QuoteResult,
} from "./withdrawToSolana";
