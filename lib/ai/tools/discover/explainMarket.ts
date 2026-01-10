// ============================================================================
// explainMarket Tool
// Deep context for AI decision-making and user understanding before trading
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { dflowMetadataFetch } from "@/lib/prediction-market/kalshi/dflow/client";
import { assertResponseOk } from "@/lib/prediction-market/kalshi/dflow/utils";
import { gammaFetch } from "@/lib/prediction-market/polymarket/client";
import type { ExplainMarketResult, RawOrderbook } from "./types";

// ============================================================================
// Kalshi/dflow Types
// ============================================================================

interface KalshiMarketResponse {
  ticker: string;
  title: string;
  subtitle?: string;
  eventTicker?: string;
  category?: string;
  status: string;
  accounts: Record<string, { yesMint: string; noMint: string; marketLedger: string }>;
  volume?: number;
  openInterest?: number;
  openTime?: string;
  closeTime?: string;
  expirationTime?: string;
  result?: string;
}

interface KalshiEventResponse {
  ticker: string;
  title: string;
  subtitle?: string;
  seriesTicker: string;
  markets?: Array<{
    ticker: string;
    title: string;
    status: string;
    accounts: Record<string, { yesMint: string; noMint: string }>;
    volume?: number;
    openInterest?: number;
  }>;
}

interface KalshiOrderbookResponse {
  marketTicker: string;
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
  timestamp?: string;
}

// ============================================================================
// Polymarket Types
// ============================================================================

interface PolymarketMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  description: string | null;
  outcomes: string[];
  outcomePrices: string[];
  active: boolean;
  closed: boolean;
  volume: number;
  volume24hr: number;
  liquidity: number;
  endDate: string | null;
  resolutionSource?: string | null;
  events?: Array<{
    id: string;
    title: string;
    slug: string;
  }>;
}

interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  resolutionSource: string | null;
  markets?: PolymarketMarket[];
}

interface PolymarketOrderbook {
  market: string;
  asset_id: string;
  timestamp: string;
  hash: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  min_tick_size?: string;
  neg_risk?: boolean;
}

// ============================================================================
// Kalshi Helper Functions
// ============================================================================

async function fetchKalshiMarket(ticker: string): Promise<KalshiMarketResponse> {
  const response = await dflowMetadataFetch(`/market/${ticker}`);
  await assertResponseOk(response, "fetch Kalshi market");
  return response.json();
}

async function fetchKalshiEvent(eventTicker: string): Promise<KalshiEventResponse> {
  const response = await dflowMetadataFetch(`/event/${eventTicker}`);
  await assertResponseOk(response, "fetch Kalshi event");
  return response.json();
}

async function fetchKalshiOrderbook(marketTicker: string): Promise<KalshiOrderbookResponse | null> {
  try {
    const response = await dflowMetadataFetch(`/orderbook/${marketTicker}`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

// ============================================================================
// Polymarket Helper Functions
// ============================================================================

async function fetchPolymarketMarket(marketId: string): Promise<PolymarketMarket | null> {
  const response = await gammaFetch(`/markets/${marketId}`);
  if (!response.ok) return null;
  return response.json();
}

async function fetchPolymarketEvent(eventId: string): Promise<PolymarketEvent | null> {
  const response = await gammaFetch(`/events/${eventId}`);
  if (!response.ok) return null;
  return response.json();
}

async function fetchPolymarketOrderbook(tokenId: string): Promise<PolymarketOrderbook | null> {
  try {
    const response = await fetch(`https://clob.polymarket.com/book?token_id=${tokenId}`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

// ============================================================================
// Explain Functions
// ============================================================================

async function explainKalshiMarket(
  marketTicker: string,
  includeRelated: boolean,
): Promise<ExplainMarketResult> {
  const market = await fetchKalshiMarket(marketTicker);

  // Extract accounts
  const accountEntries = Object.entries(market.accounts);
  const [, accounts] = accountEntries[0] ?? [null, { yesMint: "", noMint: "" }];

  // Fetch event for parent context
  let event: KalshiEventResponse | null = null;
  if (market.eventTicker) {
    try {
      event = await fetchKalshiEvent(market.eventTicker);
    } catch {
      // Event fetch failed, continue without it
    }
  }

  // Fetch orderbook
  const orderbookData = await fetchKalshiOrderbook(marketTicker);
  let orderbook: RawOrderbook | undefined;

  if (orderbookData) {
    orderbook = {
      market: marketTicker,
      asset_id: accounts.yesMint,
      timestamp: orderbookData.timestamp ?? new Date().toISOString(),
      hash: "",
      bids: orderbookData.bids.map((b) => ({
        price: String(b.price),
        size: String(b.quantity),
      })),
      asks: orderbookData.asks.map((a) => ({
        price: String(a.price),
        size: String(a.quantity),
      })),
    };
  }

  // Determine status
  let status: "active" | "closed" | "resolved" = "active";
  if (market.status === "determined" || market.result) {
    status = "resolved";
  } else if (market.status !== "active") {
    status = "closed";
  }

  // Related markets from event
  const relatedMarkets = includeRelated && event?.markets
    ? event.markets
        .filter((m) => m.ticker !== marketTicker)
        .slice(0, 5)
        .map((m) => ({
          id: m.ticker,
          question: m.title,
          price: { yes: 0, no: 0 },
        }))
    : undefined;

  return {
    success: true,
    source: "kalshi",
    id: marketTicker,
    question: market.title,
    description: market.subtitle,
    event: {
      id: event?.ticker ?? market.eventTicker ?? "",
      title: event?.title ?? "",
      series_ticker: event?.seriesTicker,
    },
    trading: {
      market_ticker: marketTicker,
      yes_mint: accounts.yesMint,
      no_mint: accounts.noMint,
    },
    prices: { yes: 0, no: 0 }, // Would need live data endpoint for prices
    volume_24h: market.volume,
    open_interest: market.openInterest,
    resolution: {
      end_date: market.expirationTime ?? market.closeTime,
      status,
      outcome: market.result === "yes" ? "yes" : market.result === "no" ? "no" : undefined,
    },
    orderbook,
    related_markets: relatedMarkets,
  };
}

async function explainPolymarketMarket(
  marketId: string,
  includeRelated: boolean,
): Promise<ExplainMarketResult> {
  const market = await fetchPolymarketMarket(marketId);

  if (!market) {
    return {
      success: false,
      source: "polymarket",
      id: marketId,
      question: "",
      event: { id: "", title: "" },
      trading: {},
      prices: { yes: 0, no: 0 },
      resolution: { status: "closed" },
      error: `Market ${marketId} not found`,
    };
  }

  // Get event context
  let event: PolymarketEvent | null = null;
  const eventRef = market.events?.[0];
  if (eventRef?.id) {
    try {
      event = await fetchPolymarketEvent(eventRef.id);
    } catch {
      // Event fetch failed, continue without it
    }
  }

  // Parse prices
  const yesPrice = parseFloat(market.outcomePrices?.[0] ?? "0");
  const noPrice = parseFloat(market.outcomePrices?.[1] ?? "0");

  // Token IDs are typically derived from conditionId + outcome index
  // The outcomes array usually contains the outcome names, not token IDs
  // For binary markets, we need the CLOB token_id from the tokens endpoint
  // For now, we'll use conditionId as a reference
  const yesTokenId = market.conditionId ? `${market.conditionId}:0` : "";
  const noTokenId = market.conditionId ? `${market.conditionId}:1` : "";

  // Fetch orderbook for YES token
  let orderbook: RawOrderbook | undefined;
  if (yesTokenId) {
    const orderbookData = await fetchPolymarketOrderbook(yesTokenId);
    if (orderbookData) {
      orderbook = {
        market: market.id,
        asset_id: orderbookData.asset_id || yesTokenId,
        timestamp: orderbookData.timestamp,
        hash: orderbookData.hash,
        bids: orderbookData.bids,
        asks: orderbookData.asks,
        min_order_size: orderbookData.min_tick_size,
        neg_risk: orderbookData.neg_risk,
      };
    }
  }

  // Determine status
  let status: "active" | "closed" | "resolved" = "active";
  if (market.closed) {
    status = "closed";
  }
  if (!market.active) {
    status = "closed";
  }

  // Related markets from event
  const relatedMarkets = includeRelated && event?.markets
    ? event.markets
        .filter((m) => m.id !== marketId)
        .slice(0, 5)
        .map((m) => ({
          id: m.id,
          question: m.question,
          price: {
            yes: parseFloat(m.outcomePrices?.[0] ?? "0"),
            no: parseFloat(m.outcomePrices?.[1] ?? "0"),
          },
        }))
    : undefined;

  return {
    success: true,
    source: "polymarket",
    id: marketId,
    question: market.question,
    description: market.description ?? undefined,
    event: {
      id: event?.id ?? eventRef?.id ?? "",
      title: event?.title ?? eventRef?.title ?? "",
      slug: event?.slug ?? eventRef?.slug,
    },
    trading: {
      condition_id: market.conditionId,
      yes_token_id: yesTokenId,
      no_token_id: noTokenId,
    },
    prices: { yes: yesPrice, no: noPrice },
    volume_24h: market.volume24hr,
    total_volume: market.volume,
    liquidity: market.liquidity,
    resolution: {
      source: event?.resolutionSource ?? undefined,
      end_date: market.endDate ?? undefined,
      status,
    },
    orderbook,
    related_markets: relatedMarkets,
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

export const explainMarketTool = tool({
  description:
    "Get deep context for a specific market before trading. " +
    "Returns: description, resolution criteria, raw orderbook, related markets. " +
    "Use discoverMarkets first to find market IDs.",
  inputSchema: z.object({
    exchange: z
      .enum(["kalshi", "polymarket"])
      .describe("Which exchange the market is on"),
    id: z
      .string()
      .describe("Market identifier: market_ticker (Kalshi) or market_id (Polymarket)"),
    include_related: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include related markets from same event. Default: false"),
  }),
  execute: async ({
    exchange,
    id,
    include_related = false,
  }): Promise<ExplainMarketResult> => {
    console.log("[explainMarket] Executing:", { exchange, id, include_related });

    try {
      if (exchange === "kalshi") {
        return await explainKalshiMarket(id, include_related);
      } else {
        return await explainPolymarketMarket(id, include_related);
      }
    } catch (error) {
      console.error("[explainMarket] Error:", error);
      return {
        success: false,
        source: exchange,
        id,
        question: "",
        event: { id: "", title: "" },
        trading: {},
        prices: { yes: 0, no: 0 },
        resolution: { status: "closed" },
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
