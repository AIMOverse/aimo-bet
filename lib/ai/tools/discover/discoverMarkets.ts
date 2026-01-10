// ============================================================================
// discoverMarkets Tool
// Lightweight discovery for scanning/listing markets across exchanges
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import {
  fetchEvents,
  fetchEventsBySeries,
  fetchSeriesByCategory,
} from "@/lib/prediction-market/kalshi/dflow/prediction-markets/discover";
import type { MarketStatus } from "@/lib/prediction-market/kalshi/dflow/prediction-markets/types";
import {
  fetchActiveEvents,
  fetchEventsByTagSlug,
  type Event as PolymarketEvent,
} from "@/lib/prediction-market/polymarket/gamma/discover";
import { getKalshiCategories, getPolymarketTags } from "./categories";
import type {
  CompositeCursor,
  DiscoverMarketsResult,
  MarketSummary,
  UnifiedCategory,
} from "./types";

// ============================================================================
// Internal Discovery Functions
// ============================================================================

async function discoverFromKalshi(params: {
  category?: string;
  query?: string;
  status: MarketStatus;
  limit: number;
  cursor?: number;
}): Promise<{
  markets: MarketSummary[];
  cursor?: number;
  hasMore: boolean;
}> {
  const { category, query, status, limit, cursor } = params;

  let events;

  if (category) {
    const kalshiCategories = getKalshiCategories(category as UnifiedCategory);
    const seriesResponse = await fetchSeriesByCategory(kalshiCategories[0], {
      status,
    });

    if (!seriesResponse.series?.length) {
      return { markets: [], hasMore: false };
    }

    const seriesTickers = seriesResponse.series
      .map((s) => s.ticker)
      .slice(0, 25);

    const eventsResponse = await fetchEventsBySeries(seriesTickers, {
      withNestedMarkets: true,
      status,
      limit,
      cursor,
    });
    events = eventsResponse.events;
  } else {
    const eventsResponse = await fetchEvents({
      withNestedMarkets: true,
      status,
      limit,
      cursor,
    });
    events = eventsResponse.events;
  }

  const markets: MarketSummary[] = [];

  for (const event of events) {
    for (const market of event.markets ?? []) {
      if (query) {
        const q = query.toLowerCase();
        const matches =
          market.title.toLowerCase().includes(q) ||
          event.title.toLowerCase().includes(q);
        if (!matches) continue;
      }

      // Lightweight: only id, question, price, volume, status, end_date
      markets.push({
        source: "kalshi",
        id: market.ticker,
        question: market.title,
        category: (category as UnifiedCategory) ?? "crypto",
        price: { yes: 0, no: 0 }, // Kalshi doesn't return prices in events endpoint
        volume_24h: market.volume,
        status:
          market.status === "determined"
            ? "resolved"
            : market.status === "active"
              ? "active"
              : "closed",
      });
    }
  }

  const hasMore = markets.length >= limit;
  const nextCursor = hasMore ? (cursor ?? 0) + limit : undefined;

  return {
    markets: markets.slice(0, limit),
    cursor: nextCursor,
    hasMore,
  };
}

async function discoverFromPolymarket(params: {
  category?: string;
  query?: string;
  status: "active" | "closed";
  limit: number;
  offset: number;
}): Promise<{
  markets: MarketSummary[];
  offset?: number;
  hasMore: boolean;
}> {
  const { category, query, status, limit, offset } = params;

  let events: PolymarketEvent[];

  if (category) {
    const polymarketTags = getPolymarketTags(category as UnifiedCategory);

    if (polymarketTags.length === 0) {
      return { markets: [], hasMore: false };
    }

    const response = await fetchEventsByTagSlug(polymarketTags[0], {
      limit,
      offset,
      closed: status === "closed",
    });
    events = response.events;
  } else {
    const response = await fetchActiveEvents({
      limit,
      offset,
    });
    events = response.events;
  }

  const markets: MarketSummary[] = [];

  for (const event of events) {
    for (const market of event.markets ?? []) {
      if (query) {
        const q = query.toLowerCase();
        const matches =
          market.question.toLowerCase().includes(q) ||
          event.title.toLowerCase().includes(q);
        if (!matches) continue;
      }

      if (status === "active" && (market.closed || !market.active)) continue;
      if (status === "closed" && !market.closed) continue;

      const yesPrice = parseFloat(market.outcomePrices?.[0] ?? "0");
      const noPrice = parseFloat(market.outcomePrices?.[1] ?? "0");

      // Lightweight: only id, question, price, volume, status, end_date
      markets.push({
        source: "polymarket",
        id: market.id,
        question: market.question,
        category: (category as UnifiedCategory) ?? "crypto",
        price: { yes: yesPrice, no: noPrice },
        volume_24h: market.volume24hr,
        status: market.closed ? "closed" : market.active ? "active" : "closed",
        end_date: market.endDate ?? undefined,
      });
    }
  }

  const hasMore = events.length >= limit;
  const nextOffset = hasMore ? offset + limit : undefined;

  return {
    markets: markets.slice(0, limit),
    offset: nextOffset,
    hasMore,
  };
}

// ============================================================================
// Tool Definition
// ============================================================================

export const discoverMarketsTool = tool({
  description:
    "Lightweight discovery for scanning prediction markets across Kalshi and Polymarket. " +
    "Returns minimal data: id, question, price, volume, status. " +
    "Use explainMarket for full context before trading.",
  inputSchema: z.object({
    exchange: z
      .enum(["kalshi", "polymarket", "all"])
      .optional()
      .default("all")
      .describe("Which exchange(s) to query. Default: all"),
    category: z
      .enum(["crypto", "politics", "sports"])
      .optional()
      .describe("Filter by unified category"),
    query: z
      .string()
      .optional()
      .describe("Search terms to match against market questions"),
    status: z
      .enum(["active", "closed", "resolved"])
      .optional()
      .default("active")
      .describe("Filter by market status. Default: active"),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Maximum markets to return. Default: 10, max: 50"),
    cursor: z
      .object({
        kalshi: z.number().optional(),
        polymarket: z.number().optional(),
      })
      .optional()
      .describe("Pagination cursor from previous response"),
  }),
  execute: async ({
    exchange = "all",
    category,
    query,
    status = "active",
    limit = 10,
    cursor,
  }): Promise<DiscoverMarketsResult> => {
    console.log("[discoverMarkets] Executing:", {
      exchange,
      category,
      query,
      status,
      limit,
      cursor,
    });

    const results: MarketSummary[] = [];
    const nextCursor: CompositeCursor = {};
    const sourceBreakdown = { kalshi: 0, polymarket: 0 };
    const perExchange = exchange === "all" ? Math.ceil(limit / 2) : limit;

    try {
      const promises: Promise<void>[] = [];

      // Fetch from Kalshi
      if (exchange === "all" || exchange === "kalshi") {
        const kalshiStatus: MarketStatus =
          status === "resolved"
            ? "determined"
            : status === "closed"
              ? "determined"
              : "active";

        promises.push(
          discoverFromKalshi({
            category,
            query,
            status: kalshiStatus,
            limit: perExchange,
            cursor: cursor?.kalshi,
          }).then((response) => {
            results.push(...response.markets);
            sourceBreakdown.kalshi = response.markets.length;
            if (response.hasMore && response.cursor !== undefined) {
              nextCursor.kalshi = response.cursor;
            }
          }),
        );
      }

      // Fetch from Polymarket
      if (exchange === "all" || exchange === "polymarket") {
        const polymarketStatus: "active" | "closed" =
          status === "resolved"
            ? "closed"
            : status === "closed"
              ? "closed"
              : "active";

        promises.push(
          discoverFromPolymarket({
            category,
            query,
            status: polymarketStatus,
            limit: perExchange,
            offset: cursor?.polymarket ?? 0,
          }).then((response) => {
            results.push(...response.markets);
            sourceBreakdown.polymarket = response.markets.length;
            if (response.hasMore && response.offset !== undefined) {
              nextCursor.polymarket = response.offset;
            }
          }),
        );
      }

      await Promise.all(promises);

      // Sort by volume descending (most liquid first)
      results.sort((a, b) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0));

      // Truncate to requested limit
      const markets = results.slice(0, limit);

      console.log("[discoverMarkets] Found:", {
        total: markets.length,
        kalshi: sourceBreakdown.kalshi,
        polymarket: sourceBreakdown.polymarket,
      });

      return {
        success: true,
        markets,
        cursor: Object.keys(nextCursor).length > 0 ? nextCursor : undefined,
        has_more: Object.keys(nextCursor).length > 0,
        source_breakdown: sourceBreakdown,
      };
    } catch (error) {
      console.error("[discoverMarkets] Error:", error);
      return {
        success: false,
        markets: [],
        has_more: false,
        source_breakdown: sourceBreakdown,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
