import { tool } from "ai";
import { z } from "zod";
import {
  fetchEvents,
  fetchEventsBySeries,
  fetchSeriesByCategory,
} from "@/lib/dflow/prediction-markets/discover";
import type { MarketStatus } from "@/lib/dflow/prediction-markets/types";
import { getKalshiCategories } from "./categories";
import type {
  KalshiMarketResult,
  UnifiedCategory,
  UnifiedMarket,
} from "./types";

export const discoverMarketFromKalshiTool = tool({
  description:
    "Discover prediction markets from Kalshi exchange. " +
    "Returns markets with Solana token addresses (yes_mint, no_mint) for trading.",
  inputSchema: z.object({
    category: z
      .enum([
        "crypto",
        "politics",
        "sports",
        "economics",
        "entertainment",
        "science",
      ])
      .optional()
      .describe("Filter by category"),
    series_ticker: z
      .string()
      .optional()
      .describe("Filter by series ticker (e.g., 'BTCD-DAILY')"),
    query: z
      .string()
      .optional()
      .describe("Search terms to match against market questions"),
    status: z
      .enum(["active", "initialized", "determined"])
      .optional()
      .default("active")
      .describe("Filter by market status. Default: active"),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Maximum markets to return. Default: 10"),
    cursor: z
      .number()
      .optional()
      .describe("Pagination cursor from previous response"),
  }),
  execute: async ({
    category,
    series_ticker,
    query,
    status = "active",
    limit = 10,
    cursor,
  }): Promise<KalshiMarketResult> => {
    console.log("[discoverMarketFromKalshi] Executing:", {
      category,
      series_ticker,
      query,
      status,
      limit,
      cursor,
    });

    try {
      let events;
      let seriesTicker: string | undefined;

      const marketStatus = status as MarketStatus;

      if (series_ticker) {
        // Direct series filter
        const eventsResponse = await fetchEventsBySeries(series_ticker, {
          withNestedMarkets: true,
          status: marketStatus,
          limit,
          cursor,
        });
        events = eventsResponse.events;
        seriesTicker = series_ticker;
      } else if (category) {
        // Category -> series -> events
        const kalshiCategories = getKalshiCategories(
          category as UnifiedCategory
        );
        const seriesResponse = await fetchSeriesByCategory(kalshiCategories[0], {
          status: marketStatus,
        });

        if (!seriesResponse.series?.length) {
          return {
            success: true,
            markets: [],
            has_more: false,
            filters_applied: { category, status },
          };
        }

        const seriesTickers = seriesResponse.series
          .map((s) => s.ticker)
          .slice(0, 25);
        seriesTicker = seriesTickers[0];

        const eventsResponse = await fetchEventsBySeries(seriesTickers, {
          withNestedMarkets: true,
          status: marketStatus,
          limit,
          cursor,
        });
        events = eventsResponse.events;
      } else {
        // No filter - fetch all
        const eventsResponse = await fetchEvents({
          withNestedMarkets: true,
          status: marketStatus,
          limit,
          cursor,
        });
        events = eventsResponse.events;
      }

      // Transform to unified format
      const markets: UnifiedMarket[] = [];

      for (const event of events) {
        for (const market of event.markets ?? []) {
          const accountEntries = Object.entries(market.accounts);
          const [, accounts] = accountEntries[0] ?? [
            null,
            { yesMint: "", noMint: "" },
          ];

          // Apply query filter
          if (query) {
            const q = query.toLowerCase();
            const matches =
              market.title.toLowerCase().includes(q) ||
              event.title.toLowerCase().includes(q);
            if (!matches) continue;
          }

          markets.push({
            source: "kalshi",
            question: market.title,
            event_title: event.title,
            category: (category as UnifiedCategory) ?? "crypto",
            kalshi: {
              market_ticker: market.ticker,
              event_ticker: event.ticker,
              series_ticker: seriesTicker ?? event.seriesTicker,
              yes_mint: accounts.yesMint,
              no_mint: accounts.noMint,
            },
            outcomes: ["Yes", "No"],
            volume_24h: market.volume,
            liquidity: market.openInterest,
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
        success: true,
        markets: markets.slice(0, limit),
        cursor: nextCursor,
        has_more: hasMore,
        filters_applied: { category, series_ticker, query, status },
      };
    } catch (error) {
      console.error("[discoverMarketFromKalshi] Error:", error);
      return {
        success: false,
        markets: [],
        has_more: false,
        filters_applied: { category, series_ticker, query, status },
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
