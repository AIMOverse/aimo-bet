// ============================================================================
// Discover Event Tool
// Event-centric market discovery using dflow Prediction Market Metadata API
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import {
  fetchEvents,
  fetchActiveEvents,
  fetchEventsBySeries,
  fetchSeriesByCategory,
  fetchSeriesByTags,
  fetchTagsByCategories,
  type Event,
  type Market,
  type Series,
} from "@/lib/dflow/prediction-markets/discover";
import type { MarketStatus } from "@/lib/dflow/prediction-markets/types";

// ============================================================================
// Types
// ============================================================================

interface MarketOutput {
  market_ticker: string;
  title: string;
  status: "active" | "initialized" | "determined" | "finalized";
  yes_mint: string;
  no_mint: string;
  indicative_prices?: {
    yes: number;
    no: number;
    timestamp: string;
  };
  volume_24h?: number;
  open_interest?: number;
  result?: "yes" | "no";
}

interface EventOutput {
  event_ticker: string;
  event_title: string;
  event_subtitle?: string;
  series_ticker: string;
  series_title?: string;
  category?: string;
  tags?: string[];
  markets: MarketOutput[];
  market_count: number;
  total_volume?: number;
}

interface DiscoverEventResult {
  success: boolean;
  events: EventOutput[];
  total_events: number;
  total_markets: number;
  filters_applied: Record<string, unknown>;
  /** Pagination offset for next page - pass this value to cursor parameter to get more results */
  cursor?: number;
  has_more: boolean;
  price_note: string;
  prices_as_of?: string;
  available_categories?: string[];
  available_series?: Array<{ ticker: string; title: string }>;
  error?: string;
  suggestion?: string;
}

// ============================================================================
// Constants
// ============================================================================

// Categories available from dflow API (as of 2025-01)
// Only "Crypto" is currently enabled for agent discovery
const KNOWN_CATEGORIES = [
  "Crypto",
  // "Climate and Weather",
  // "Companies",
  // "Economics",
  // "Elections",
  // "Entertainment",
  // "Financials",
  // "Mentions",
  // "Politics",
  // "Science and Technology",
  // "Social",
  // "Sports",
  // "Transportation",
];

const PRICE_NOTE =
  "Prices are indicative snapshots. Actual execution prices may differ.";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find closest matching category for typo correction
 */
function findClosestCategory(input: string): string | undefined {
  const inputLower = input.toLowerCase();

  // Check for exact match first
  if (KNOWN_CATEGORIES.includes(inputLower)) {
    return inputLower;
  }

  // Simple substring/prefix matching for suggestions
  for (const cat of KNOWN_CATEGORIES) {
    if (cat.startsWith(inputLower) || inputLower.startsWith(cat)) {
      return cat;
    }
    // Simple Levenshtein-like check: if >60% characters match
    const matchCount = [...inputLower].filter((c) => cat.includes(c)).length;
    if (matchCount / inputLower.length > 0.6) {
      return cat;
    }
  }

  return undefined;
}

/**
 * Filter events/markets by query string (client-side)
 */
function filterByQuery(events: Event[], query: string): Event[] {
  const queryLower = query.toLowerCase();

  return events
    .map((event) => {
      // Check if event title/subtitle matches
      const eventMatches =
        event.title.toLowerCase().includes(queryLower) ||
        event.subtitle?.toLowerCase().includes(queryLower);

      // Filter markets that match
      const matchingMarkets =
        event.markets?.filter(
          (m) =>
            m.title.toLowerCase().includes(queryLower) ||
            m.subtitle?.toLowerCase().includes(queryLower),
        ) ?? [];

      // Include event if event matches OR has matching markets
      if (eventMatches) {
        return event; // Keep all markets
      } else if (matchingMarkets.length > 0) {
        return { ...event, markets: matchingMarkets };
      }
      return null;
    })
    .filter((e): e is Event => e !== null);
}

/**
 * Transform dflow Event to output format
 */
function transformEvent(
  event: Event,
  seriesMap: Map<string, Series>,
): EventOutput {
  const series = seriesMap.get(event.seriesTicker);

  const markets: MarketOutput[] = (event.markets ?? []).map((m) => {
    // Get first account entry (markets typically have one account set)
    const accountEntries = Object.entries(m.accounts);
    const [, accounts] = accountEntries[0] ?? [
      null,
      { yesMint: "", noMint: "" },
    ];

    return {
      market_ticker: m.ticker,
      title: m.title,
      status: m.status as MarketOutput["status"],
      yes_mint: accounts.yesMint,
      no_mint: accounts.noMint,
      volume_24h: m.volume,
      open_interest: m.openInterest,
      // Note: indicative_prices would need a separate live data fetch
      // For now, we don't include them to avoid extra API calls
    };
  });

  const totalVolume = markets.reduce((sum, m) => sum + (m.volume_24h ?? 0), 0);

  return {
    event_ticker: event.ticker,
    event_title: event.title,
    event_subtitle: event.subtitle,
    series_ticker: event.seriesTicker,
    series_title: series?.title,
    category: series?.category,
    tags: series?.tags,
    markets,
    market_count: markets.length,
    total_volume: totalVolume > 0 ? totalVolume : undefined,
  };
}

/**
 * Filter markets by status
 */
function filterMarketsByStatus(events: Event[], status: MarketStatus): Event[] {
  return events
    .map((event) => ({
      ...event,
      markets: event.markets?.filter((m) => m.status === status),
    }))
    .filter((e) => e.markets && e.markets.length > 0);
}

// ============================================================================
// Tool Definition
// ============================================================================

export const discoverEventTool = tool({
  description:
    "Discover prediction market events with nested markets. Primary discovery tool for finding trading opportunities. Returns events with their associated markets, including token addresses needed for trading.",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe("Search terms to match against event/market titles"),
    category: z
      .string()
      .optional()
      .describe("Filter by category. Currently only 'Crypto' is available."),
    tags: z
      .array(z.string())
      .optional()
      .describe("Filter by tags (e.g., ['bitcoin', 'price'])"),
    series_ticker: z
      .string()
      .optional()
      .describe("Filter to specific series (e.g., 'BTCD-DAILY')"),
    event_ticker: z
      .string()
      .optional()
      .describe("Get details for a specific event by ticker"),
    status: z
      .enum(["active", "initialized", "determined", "finalized"])
      .optional()
      .default("active")
      .describe("Filter by market status (default: active)"),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Maximum events to return (default: 10, max: 50)"),
    cursor: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Pagination offset - number of events to skip. Use 0 or omit to start from beginning. " +
          "Only use values returned in previous response's 'cursor' field.",
      ),
  }),
  execute: async ({
    query,
    category,
    tags,
    series_ticker,
    event_ticker,
    status = "active",
    limit = 10,
    cursor,
  }): Promise<DiscoverEventResult> => {
    console.log("[discoverEvent] Executing:", {
      query,
      category,
      tags,
      series_ticker,
      event_ticker,
      status,
      limit,
      cursor,
    });

    const filtersApplied: Record<string, unknown> = {};
    const seriesMap = new Map<string, Series>();
    let events: Event[] = [];
    let responseCursor: number | undefined;
    let availableCategories: string[] | undefined;
    let availableSeries: Array<{ ticker: string; title: string }> | undefined;

    try {
      // Fetch available categories for suggestions
      try {
        const tagsResponse = await fetchTagsByCategories();
        availableCategories = Object.keys(tagsResponse.tagsByCategories);
      } catch {
        // Non-fatal, continue without categories
      }

      // Route based on filter type
      if (event_ticker) {
        // Fetch specific event by ticker
        filtersApplied.event_ticker = event_ticker;

        // fetchEvents doesn't support direct event_ticker filter,
        // so we fetch all and filter client-side
        const response = await fetchEvents({
          withNestedMarkets: true,
          status: status as MarketStatus,
          limit: 100, // Fetch more to find the event
        });

        events = response.events.filter((e) => e.ticker === event_ticker);

        if (events.length === 0) {
          return {
            success: false,
            events: [],
            total_events: 0,
            total_markets: 0,
            filters_applied: filtersApplied,
            has_more: false,
            price_note: PRICE_NOTE,
            error: `Event '${event_ticker}' not found`,
            suggestion:
              "Check the event ticker or try browsing active events without a filter",
            available_categories: availableCategories,
          };
        }
      } else if (category) {
        // Filter by category -> series -> events
        filtersApplied.category = category;

        // Check for typos in category
        if (
          !availableCategories?.includes(category.toLowerCase()) &&
          availableCategories
        ) {
          const suggestion = findClosestCategory(category);
          if (suggestion && suggestion !== category.toLowerCase()) {
            return {
              success: false,
              events: [],
              total_events: 0,
              total_markets: 0,
              filters_applied: filtersApplied,
              has_more: false,
              price_note: PRICE_NOTE,
              error: `No markets found for category '${category}'`,
              suggestion: `Did you mean '${suggestion}'?`,
              available_categories: availableCategories,
            };
          }
        }

        const seriesResponse = await fetchSeriesByCategory(category, {
          status: status as MarketStatus,
        });

        if (!seriesResponse.series || seriesResponse.series.length === 0) {
          return {
            success: true,
            events: [],
            total_events: 0,
            total_markets: 0,
            filters_applied: filtersApplied,
            has_more: false,
            price_note: PRICE_NOTE,
            suggestion: "Try a different category or browse without filters",
            available_categories: availableCategories,
          };
        }

        // Store series for enrichment
        seriesResponse.series.forEach((s) => seriesMap.set(s.ticker, s));
        availableSeries = seriesResponse.series.map((s) => ({
          ticker: s.ticker,
          title: s.title,
        }));

        const seriesTickers = seriesResponse.series.map((s) => s.ticker);
        const eventsResponse = await fetchEventsBySeries(seriesTickers, {
          withNestedMarkets: true,
          limit,
          cursor,
          status: status as MarketStatus,
        });

        events = eventsResponse.events;
        responseCursor = eventsResponse.cursor;
      } else if (tags && tags.length > 0) {
        // Filter by tags -> series -> events
        filtersApplied.tags = tags;

        const seriesResponse = await fetchSeriesByTags(tags, {
          status: status as MarketStatus,
        });

        if (!seriesResponse.series || seriesResponse.series.length === 0) {
          return {
            success: true,
            events: [],
            total_events: 0,
            total_markets: 0,
            filters_applied: filtersApplied,
            has_more: false,
            price_note: PRICE_NOTE,
            suggestion: `No markets found with tags [${tags.join(", ")}]. Try different tags or browse without filters.`,
            available_categories: availableCategories,
          };
        }

        seriesResponse.series.forEach((s) => seriesMap.set(s.ticker, s));
        availableSeries = seriesResponse.series.map((s) => ({
          ticker: s.ticker,
          title: s.title,
        }));

        const seriesTickers = seriesResponse.series.map((s) => s.ticker);
        const eventsResponse = await fetchEventsBySeries(seriesTickers, {
          withNestedMarkets: true,
          limit,
          cursor,
          status: status as MarketStatus,
        });

        events = eventsResponse.events;
        responseCursor = eventsResponse.cursor;
      } else if (series_ticker) {
        // Filter by specific series
        filtersApplied.series_ticker = series_ticker;

        const eventsResponse = await fetchEventsBySeries(series_ticker, {
          withNestedMarkets: true,
          limit,
          cursor,
          status: status as MarketStatus,
        });

        events = eventsResponse.events;
        responseCursor = eventsResponse.cursor;

        if (events.length === 0) {
          return {
            success: true,
            events: [],
            total_events: 0,
            total_markets: 0,
            filters_applied: filtersApplied,
            has_more: false,
            price_note: PRICE_NOTE,
            suggestion: `No events found for series '${series_ticker}'. Check the series ticker or try browsing without filters.`,
            available_categories: availableCategories,
          };
        }
      } else {
        // Browse mode - fetch active events
        filtersApplied.status = status;

        const eventsResponse =
          status === "active"
            ? await fetchActiveEvents({ limit, cursor })
            : await fetchEvents({
                withNestedMarkets: true,
                status: status as MarketStatus,
                limit,
                cursor,
              });

        events = eventsResponse.events;
        responseCursor = eventsResponse.cursor;
      }

      // Apply query filter (client-side)
      if (query) {
        filtersApplied.query = query;
        events = filterByQuery(events, query);
      }

      // Apply status filter to markets (in case API returned mixed)
      if (status && events.length > 0) {
        events = filterMarketsByStatus(events, status as MarketStatus);
      }

      // Apply limit
      if (events.length > limit) {
        events = events.slice(0, limit);
      }

      // Transform events to output format
      const outputEvents = events.map((e) => transformEvent(e, seriesMap));

      // Calculate totals
      const totalMarkets = outputEvents.reduce(
        (sum, e) => sum + e.market_count,
        0,
      );

      // Build available_series from events if not already set
      if (!availableSeries && events.length > 0) {
        const seriesSet = new Map<string, string>();
        events.forEach((e) => {
          if (!seriesSet.has(e.seriesTicker)) {
            seriesSet.set(e.seriesTicker, e.title);
          }
        });
        availableSeries = Array.from(seriesSet.entries()).map(
          ([ticker, title]) => ({ ticker, title }),
        );
      }

      console.log("[discoverEvent] Found:", {
        events: outputEvents.length,
        markets: totalMarkets,
      });

      // Debug: Log all market tickers returned to verify what the agent receives
      console.log(
        "[discoverEvent] Market tickers returned:",
        outputEvents.flatMap((e) => e.markets.map((m) => m.market_ticker)),
      );

      return {
        success: true,
        events: outputEvents,
        total_events: outputEvents.length,
        total_markets: totalMarkets,
        filters_applied: filtersApplied,
        cursor: responseCursor,
        has_more: !!responseCursor,
        price_note: PRICE_NOTE,
        prices_as_of: new Date().toISOString(),
        available_categories: availableCategories,
        available_series: availableSeries,
        suggestion:
          outputEvents.length === 0
            ? "Try broadening your search or browse without filters"
            : undefined,
      };
    } catch (error) {
      console.error("[discoverEvent] Error:", error);

      // Check for rate limiting
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("rate")
      ) {
        return {
          success: false,
          events: [],
          total_events: 0,
          total_markets: 0,
          filters_applied: filtersApplied,
          has_more: false,
          price_note: PRICE_NOTE,
          error: "Rate limited. Try again in a few seconds.",
          available_categories: availableCategories,
        };
      }

      return {
        success: false,
        events: [],
        total_events: 0,
        total_markets: 0,
        filters_applied: filtersApplied,
        has_more: false,
        price_note: PRICE_NOTE,
        error: `dflow API error: ${error instanceof Error ? error.message : "Unknown error"}`,
        available_categories: availableCategories,
      };
    }
  },
});

// ============================================================================
// Export
// ============================================================================

export { discoverEventTool as createDiscoverEventTool };
