// ============================================================================
// Prediction Market Discovery
// Functions for discovering prediction markets using the DFlow Metadata API
// Docs: https://pond.dflow.net/prediction-market-metadata-api-reference
// ============================================================================

import { dflowMetadataFetch } from "@/lib/dflow/client";
import { assertResponseOk } from "@/lib/dflow/utils";
import type {
  MarketStatus,
  BaseMarketAccounts,
  DiscoveryMarket,
  Event,
  EventsResponse,
  Series,
  SeriesResponse,
  TagsByCategories,
  TagsByCategoriesResponse,
} from "./types";

// Re-export types for convenience
export type {
  MarketStatus,
  BaseMarketAccounts as MarketAccounts,
  DiscoveryMarket as Market,
  Event,
  EventsResponse,
  Series,
  SeriesResponse,
  TagsByCategories,
  TagsByCategoriesResponse,
};

// ============================================================================
// Options Types
// ============================================================================

/** Options for fetching events */
export interface FetchEventsOptions {
  /** Include nested markets in response */
  withNestedMarkets?: boolean;
  /** Filter by market status */
  status?: MarketStatus;
  /** Filter by series tickers (comma-separated) */
  seriesTickers?: string;
  /** Filter by initialized status */
  isInitialized?: boolean;
  /** Maximum number of events to return */
  limit?: number;
  /** Pagination offset - number of events to skip */
  cursor?: number;
  /** Sort field */
  sort?: string;
}

/** Options for fetching series */
export interface FetchSeriesOptions {
  /** Filter by category */
  category?: string;
  /** Filter by tags (comma-separated) */
  tags?: string;
  /** Filter by initialized status */
  isInitialized?: boolean;
  /** Filter by market status */
  status?: MarketStatus;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch events with optional nested markets
 * Use withNestedMarkets=true to get market token addresses for trading
 */
export async function fetchEvents(
  options: FetchEventsOptions = {},
): Promise<EventsResponse> {
  const params = new URLSearchParams();

  if (options.withNestedMarkets !== undefined) {
    params.set("withNestedMarkets", String(options.withNestedMarkets));
  }
  if (options.status) {
    params.set("status", options.status);
  }
  if (options.seriesTickers) {
    params.set("seriesTickers", options.seriesTickers);
  }
  if (options.isInitialized !== undefined) {
    params.set("isInitialized", String(options.isInitialized));
  }
  if (options.limit) {
    params.set("limit", String(options.limit));
  }
  if (options.cursor !== undefined) {
    params.set("cursor", String(options.cursor));
  }
  if (options.sort) {
    params.set("sort", options.sort);
  }

  const queryString = params.toString();
  const path = queryString ? `/events?${queryString}` : "/events";

  const response = await dflowMetadataFetch(path);
  await assertResponseOk(response, "fetch events");

  return response.json();
}

/**
 * Fetch events with active markets (open for trading)
 */
export async function fetchActiveEvents(
  options: Omit<FetchEventsOptions, "status"> = {},
): Promise<EventsResponse> {
  return fetchEvents({
    ...options,
    status: "active",
    withNestedMarkets: options.withNestedMarkets ?? true,
  });
}

/**
 * Fetch events with initialized markets (coming soon)
 */
export async function fetchInitializedEvents(
  options: Omit<FetchEventsOptions, "status"> = {},
): Promise<EventsResponse> {
  return fetchEvents({
    ...options,
    status: "initialized",
    withNestedMarkets: options.withNestedMarkets ?? true,
  });
}

/**
 * Fetch tags organized by categories
 * Use these to filter series and discover relevant markets
 */
export async function fetchTagsByCategories(): Promise<TagsByCategoriesResponse> {
  const response = await dflowMetadataFetch("/tags_by_categories");
  await assertResponseOk(response, "fetch tags by categories");

  return response.json();
}

/**
 * Fetch series (event templates) with optional filters
 */
export async function fetchSeries(
  options: FetchSeriesOptions = {},
): Promise<SeriesResponse> {
  const params = new URLSearchParams();

  if (options.category) {
    params.set("category", options.category);
  }
  if (options.tags) {
    params.set("tags", options.tags);
  }
  if (options.isInitialized !== undefined) {
    params.set("isInitialized", String(options.isInitialized));
  }
  if (options.status) {
    params.set("status", options.status);
  }

  const queryString = params.toString();
  const path = queryString ? `/series?${queryString}` : "/series";

  const response = await dflowMetadataFetch(path);
  await assertResponseOk(response, "fetch series");

  return response.json();
}

/**
 * Fetch series filtered by category
 */
export async function fetchSeriesByCategory(
  category: string,
  options: Omit<FetchSeriesOptions, "category"> = {},
): Promise<SeriesResponse> {
  return fetchSeries({ ...options, category });
}

/**
 * Fetch series filtered by tags
 * @param tags - Array of tags or comma-separated string
 */
export async function fetchSeriesByTags(
  tags: string | string[],
  options: Omit<FetchSeriesOptions, "tags"> = {},
): Promise<SeriesResponse> {
  const tagsString = Array.isArray(tags) ? tags.join(",") : tags;
  return fetchSeries({ ...options, tags: tagsString });
}

/**
 * Fetch events filtered by series tickers
 * @param seriesTickers - Array of series tickers or comma-separated string
 */
export async function fetchEventsBySeries(
  seriesTickers: string | string[],
  options: Omit<FetchEventsOptions, "seriesTickers"> = {},
): Promise<EventsResponse> {
  const tickersString = Array.isArray(seriesTickers)
    ? seriesTickers.join(",")
    : seriesTickers;
  return fetchEvents({
    ...options,
    seriesTickers: tickersString,
    withNestedMarkets: options.withNestedMarkets ?? true,
  });
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Extract all market token addresses from an event
 * Returns flat array of { yesMint, noMint } for each market
 */
export function extractMarketTokens(event: Event): BaseMarketAccounts[] {
  if (!event.markets) return [];

  return event.markets.flatMap((market) => Object.values(market.accounts));
}

/**
 * Extract all market token addresses from multiple events
 */
export function extractAllMarketTokens(events: Event[]): BaseMarketAccounts[] {
  return events.flatMap(extractMarketTokens);
}

/**
 * Get active markets from events
 */
export function filterActiveMarkets(events: Event[]): DiscoveryMarket[] {
  return events.flatMap(
    (event) => event.markets?.filter((m) => m.status === "active") ?? [],
  );
}

/**
 * Discover markets by category
 * Convenience function that chains: category -> series -> events with markets
 */
export async function discoverMarketsByCategory(
  category: string,
  options: { limit?: number; status?: MarketStatus } = {},
): Promise<EventsResponse> {
  // Get series for this category
  const seriesResponse = await fetchSeriesByCategory(category, {
    status: options.status,
  });

  if (!seriesResponse.series || seriesResponse.series.length === 0) {
    return { events: [] };
  }

  // Get events for these series
  const seriesTickers = seriesResponse.series.map((s) => s.ticker);
  return fetchEventsBySeries(seriesTickers, {
    withNestedMarkets: true,
    limit: options.limit,
    status: options.status,
  });
}

/**
 * Discover markets by tags
 * Convenience function that chains: tags -> series -> events with markets
 */
export async function discoverMarketsByTags(
  tags: string | string[],
  options: { limit?: number; status?: MarketStatus } = {},
): Promise<EventsResponse> {
  // Get series for these tags
  const seriesResponse = await fetchSeriesByTags(tags, {
    status: options.status,
  });

  if (!seriesResponse.series || seriesResponse.series.length === 0) {
    return { events: [] };
  }

  // Get events for these series
  const seriesTickers = seriesResponse.series.map((s) => s.ticker);
  return fetchEventsBySeries(seriesTickers, {
    withNestedMarkets: true,
    limit: options.limit,
    status: options.status,
  });
}
