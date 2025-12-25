/**
 * Arena configuration constants
 */

// Default starting capital for new sessions
export const DEFAULT_STARTING_CAPITAL = 10000;

// Polling intervals in milliseconds
export const POLLING_INTERVALS = {
  performance: 30000, // 30 seconds
  trades: 10000, // 10 seconds
  broadcasts: 10000, // 10 seconds
  positions: 30000, // 30 seconds
  session: 60000, // 60 seconds
  prices: 5000, // 5 seconds (for REST polling)
} as const;

// Market categories
export const MARKET_CATEGORIES = [
  "Politics",
  "Economics",
  "Sports",
  "Entertainment",
  "Science",
  "Technology",
  "Weather",
  "Finance",
] as const;

// Chart configuration
export const CHART_CONFIG = {
  height: 600,
  margin: { top: 20, right: 30, left: 20, bottom: 5 },
  animationDuration: 300,
} as const;

// Trade feed configuration
export const TRADE_FEED_CONFIG = {
  pageSize: 20,
  maxItems: 100,
} as const;

// Broadcast feed configuration
export const BROADCAST_FEED_CONFIG = {
  pageSize: 20,
  maxItems: 50,
} as const;
