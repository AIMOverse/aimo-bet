import { tool } from "ai";
import { z } from "zod";
import {
  fetchActiveEvents,
  fetchEventsByTagSlug,
  fetchEventBySlug,
  type Event,
} from "@/lib/polymarket/gamma/discover";
import { getPolymarketTags } from "./categories";
import type {
  PolymarketMarketResult,
  UnifiedCategory,
  UnifiedMarket,
} from "./types";

export const discoverMarketFromPolymarketTool = tool({
  description:
    "Discover prediction markets from Polymarket exchange. " +
    "Returns markets with Polygon token IDs for trading.",
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
    tag_slug: z
      .string()
      .optional()
      .describe("Filter by Polymarket tag slug (e.g., 'bitcoin')"),
    event_slug: z
      .string()
      .optional()
      .describe("Fetch specific event by slug (from Polymarket URL)"),
    query: z
      .string()
      .optional()
      .describe("Search terms to match against market questions"),
    status: z
      .enum(["active", "closed"])
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
    offset: z
      .number()
      .optional()
      .default(0)
      .describe("Pagination offset from previous response"),
  }),
  execute: async ({
    category,
    tag_slug,
    event_slug,
    query,
    status = "active",
    limit = 10,
    offset = 0,
  }): Promise<PolymarketMarketResult> => {
    console.log("[discoverMarketFromPolymarket] Executing:", {
      category,
      tag_slug,
      event_slug,
      query,
      status,
      limit,
      offset,
    });

    try {
      let events: Event[];

      if (event_slug) {
        // Fetch specific event by slug (best for individual markets)
        const event = await fetchEventBySlug(event_slug);
        events = event ? [event] : [];
      } else if (tag_slug) {
        // Filter by tag slug
        const response = await fetchEventsByTagSlug(tag_slug, {
          limit,
          offset,
          closed: status === "closed" ? true : false,
        });
        events = response.events;
      } else if (category) {
        // Category -> tag -> events
        const polymarketTags = getPolymarketTags(category as UnifiedCategory);

        if (polymarketTags.length === 0) {
          return {
            success: true,
            markets: [],
            has_more: false,
            filters_applied: { category, status },
          };
        }

        const response = await fetchEventsByTagSlug(polymarketTags[0], {
          limit,
          offset,
          closed: status === "closed" ? true : false,
        });
        events = response.events;
      } else {
        // No filter - fetch all active events (ordered by newest)
        const response = await fetchActiveEvents({
          limit,
          offset,
        });
        events = response.events;
      }

      // Transform to unified format
      const markets: UnifiedMarket[] = [];

      for (const event of events) {
        for (const market of event.markets ?? []) {
          // Apply query filter
          if (query) {
            const q = query.toLowerCase();
            const matches =
              market.question.toLowerCase().includes(q) ||
              event.title.toLowerCase().includes(q);
            if (!matches) continue;
          }

          // Apply status filter
          if (status === "active" && (market.closed || !market.active)) continue;
          if (status === "closed" && !market.closed) continue;

          // Parse outcome prices
          const yesPrice = parseFloat(market.outcomePrices?.[0] ?? "0");
          const noPrice = parseFloat(market.outcomePrices?.[1] ?? "0");

          markets.push({
            source: "polymarket",
            question: market.question,
            event_title: event.title,
            category: (category as UnifiedCategory) ?? "crypto",
            polymarket: {
              market_id: market.id,
              event_id: event.id,
              condition_id: market.conditionId,
              yes_token_id: market.outcomes?.[0] ?? "",
              no_token_id: market.outcomes?.[1] ?? "",
              slug: market.slug,
            },
            outcomes: ["Yes", "No"],
            prices: { yes: yesPrice, no: noPrice },
            volume_24h: market.volume24hr,
            liquidity: market.liquidity,
            status: market.closed ? "closed" : market.active ? "active" : "closed",
            end_date: market.endDate ?? undefined,
          });
        }
      }

      const hasMore = events.length >= limit;
      const nextOffset = hasMore ? offset + limit : undefined;

      return {
        success: true,
        markets: markets.slice(0, limit),
        offset: nextOffset,
        has_more: hasMore,
        filters_applied: { category, tag_slug, event_slug, query, status },
      };
    } catch (error) {
      console.error("[discoverMarketFromPolymarket] Error:", error);
      return {
        success: false,
        markets: [],
        has_more: false,
        filters_applied: { category, tag_slug, event_slug, query, status },
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
