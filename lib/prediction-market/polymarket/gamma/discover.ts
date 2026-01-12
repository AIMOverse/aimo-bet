// ============================================================================
// Polymarket Gamma API Discovery
// Functions for discovering prediction markets using the Gamma API
// Docs: https://docs.polymarket.com/
// ============================================================================

import { gammaFetch } from "@/lib/prediction-market/polymarket/client";
import type { Event, Market, Tag, Series } from "@/lib/prediction-market/polymarket/types";

// Re-export types for convenience
export type { Event, Market, Tag, Series };

// ============================================================================
// Options Types
// ============================================================================

export interface FetchEventsOptions {
  limit?: number;
  offset?: number;
  order?: string; // e.g., "id" for ordering by event ID
  ascending?: boolean; // false = newest first
  tag_id?: number;
  tag_slug?: string;
  exclude_tag_id?: number[];
  related_tags?: boolean;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  featured?: boolean;
  liquidity_min?: number;
  liquidity_max?: number;
  volume_min?: number;
  volume_max?: number;
  start_date_min?: string;
  start_date_max?: string;
  end_date_min?: string;
  end_date_max?: string;
}

export interface FetchMarketsOptions {
  limit?: number;
  offset?: number;
  order?: string;
  ascending?: boolean;
  tag_id?: number;
  related_tags?: boolean;
  closed?: boolean;
  liquidity_num_min?: number;
  liquidity_num_max?: number;
  volume_num_min?: number;
  volume_num_max?: number;
  start_date_min?: string;
  start_date_max?: string;
  end_date_min?: string;
  end_date_max?: string;
}

export interface FetchTagsOptions {
  limit?: number;
  offset?: number;
  order?: string;
  ascending?: boolean;
  is_carousel?: boolean;
}

// ============================================================================
// Response Types
// ============================================================================

export interface EventsResponse {
  events: Event[];
  hasMore: boolean;
}

export interface MarketsResponse {
  markets: Market[];
  hasMore: boolean;
}

export interface TagsResponse {
  tags: Tag[];
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Fetch events with optional filters
 * Recommended for complete market discovery (events contain their markets)
 */
export async function fetchEvents(
  options: FetchEventsOptions = {}
): Promise<EventsResponse> {
  const params = new URLSearchParams();

  params.set("limit", String(options.limit ?? 100));
  params.set("offset", String(options.offset ?? 0));

  // Ordering - use "id" with ascending=false for newest first
  if (options.order) params.set("order", options.order);
  if (options.ascending !== undefined)
    params.set("ascending", String(options.ascending));

  // Tag filtering
  if (options.tag_id) params.set("tag_id", String(options.tag_id));
  if (options.tag_slug) params.set("tag_slug", options.tag_slug);
  if (options.exclude_tag_id?.length) {
    params.set("exclude_tag_id", options.exclude_tag_id.join(","));
  }
  if (options.related_tags !== undefined)
    params.set("related_tags", String(options.related_tags));

  // Status filters
  if (options.active !== undefined) params.set("active", String(options.active));
  if (options.closed !== undefined) params.set("closed", String(options.closed));
  if (options.archived !== undefined)
    params.set("archived", String(options.archived));
  if (options.featured !== undefined)
    params.set("featured", String(options.featured));

  // Volume/liquidity filters
  if (options.liquidity_min)
    params.set("liquidity_min", String(options.liquidity_min));
  if (options.liquidity_max)
    params.set("liquidity_max", String(options.liquidity_max));
  if (options.volume_min) params.set("volume_min", String(options.volume_min));
  if (options.volume_max) params.set("volume_max", String(options.volume_max));

  // Date filters
  if (options.start_date_min)
    params.set("start_date_min", options.start_date_min);
  if (options.start_date_max)
    params.set("start_date_max", options.start_date_max);
  if (options.end_date_min) params.set("end_date_min", options.end_date_min);
  if (options.end_date_max) params.set("end_date_max", options.end_date_max);

  const response = await gammaFetch(`/events?${params}`);

  if (!response.ok) {
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  const events: Event[] = await response.json();
  const limit = options.limit ?? 100;

  return {
    events,
    hasMore: events.length >= limit,
  };
}

/**
 * Fetch all active events ordered by newest first
 * Best for complete market discovery
 */
export async function fetchActiveEvents(
  options: Omit<
    FetchEventsOptions,
    "active" | "closed" | "order" | "ascending"
  > = {}
): Promise<EventsResponse> {
  return fetchEvents({
    ...options,
    order: "id",
    ascending: false,
    closed: false,
  });
}

/**
 * Fetch events by tag ID
 * Use after discovering tag IDs from /tags or /sports endpoints
 */
export async function fetchEventsByTagId(
  tagId: number,
  options: Omit<FetchEventsOptions, "tag_id"> = {}
): Promise<EventsResponse> {
  return fetchEvents({
    ...options,
    tag_id: tagId,
  });
}

/**
 * Fetch events by tag slug
 */
export async function fetchEventsByTagSlug(
  tagSlug: string,
  options: Omit<FetchEventsOptions, "tag_slug"> = {}
): Promise<EventsResponse> {
  return fetchEvents({
    ...options,
    tag_slug: tagSlug,
  });
}

/**
 * Fetch a single event by slug (from URL)
 * Best for fetching specific individual events
 */
export async function fetchEventBySlug(slug: string): Promise<Event | null> {
  const response = await gammaFetch(`/events/slug/${slug}`);

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch a single event by ID
 */
export async function fetchEventById(id: string): Promise<Event | null> {
  const response = await gammaFetch(`/events/${id}`);

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch markets with optional filters
 */
export async function fetchMarkets(
  options: FetchMarketsOptions = {}
): Promise<MarketsResponse> {
  const params = new URLSearchParams();

  params.set("limit", String(options.limit ?? 100));
  params.set("offset", String(options.offset ?? 0));

  if (options.order) params.set("order", options.order);
  if (options.ascending !== undefined)
    params.set("ascending", String(options.ascending));
  if (options.tag_id) params.set("tag_id", String(options.tag_id));
  if (options.related_tags !== undefined)
    params.set("related_tags", String(options.related_tags));
  if (options.closed !== undefined) params.set("closed", String(options.closed));
  if (options.liquidity_num_min)
    params.set("liquidity_num_min", String(options.liquidity_num_min));
  if (options.liquidity_num_max)
    params.set("liquidity_num_max", String(options.liquidity_num_max));
  if (options.volume_num_min)
    params.set("volume_num_min", String(options.volume_num_min));
  if (options.volume_num_max)
    params.set("volume_num_max", String(options.volume_num_max));
  if (options.start_date_min)
    params.set("start_date_min", options.start_date_min);
  if (options.start_date_max)
    params.set("start_date_max", options.start_date_max);
  if (options.end_date_min) params.set("end_date_min", options.end_date_min);
  if (options.end_date_max) params.set("end_date_max", options.end_date_max);

  const response = await gammaFetch(`/markets?${params}`);

  if (!response.ok) {
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  const markets: Market[] = await response.json();
  const limit = options.limit ?? 100;

  return {
    markets,
    hasMore: markets.length >= limit,
  };
}

/**
 * Fetch active markets
 */
export async function fetchActiveMarkets(
  options: Omit<FetchMarketsOptions, "closed"> = {}
): Promise<MarketsResponse> {
  return fetchMarkets({
    ...options,
    closed: false,
  });
}

/**
 * Fetch markets by tag ID
 */
export async function fetchMarketsByTagId(
  tagId: number,
  options: Omit<FetchMarketsOptions, "tag_id"> = {}
): Promise<MarketsResponse> {
  return fetchMarkets({
    ...options,
    tag_id: tagId,
  });
}

/**
 * Fetch a single market by slug
 * Best for fetching specific individual markets
 */
export async function fetchMarketBySlug(slug: string): Promise<Market | null> {
  const response = await gammaFetch(`/markets/slug/${slug}`);

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch a single market by ID
 */
export async function fetchMarketById(id: string): Promise<Market | null> {
  const response = await gammaFetch(`/markets/${id}`);

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch available tags
 * Use to discover tag IDs for filtering
 */
export async function fetchTags(
  options: FetchTagsOptions = {}
): Promise<TagsResponse> {
  const params = new URLSearchParams();

  params.set("limit", String(options.limit ?? 100));
  params.set("offset", String(options.offset ?? 0));

  if (options.order) params.set("order", options.order);
  if (options.ascending !== undefined)
    params.set("ascending", String(options.ascending));
  if (options.is_carousel !== undefined)
    params.set("is_carousel", String(options.is_carousel));

  const response = await gammaFetch(`/tags?${params}`);

  if (!response.ok) {
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  const tags: Tag[] = await response.json();

  return { tags };
}

/**
 * Fetch sports metadata including tag IDs
 * Returns comprehensive sports data with images, resolution sources, series info
 */
export async function fetchSports(): Promise<unknown> {
  const response = await gammaFetch("/sports");

  if (!response.ok) {
    throw new Error(`Polymarket API error: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Extract markets from events
 */
export function extractMarketsFromEvents(events: Event[]): Market[] {
  return events.flatMap((event) => event.markets ?? []);
}

/**
 * Filter active markets from a list
 */
export function filterActiveMarkets(markets: Market[]): Market[] {
  return markets.filter((m) => m.active && !m.closed);
}

/**
 * Discover markets by tag slug
 * Convenience: fetches events by tag, extracts markets
 */
export async function discoverMarketsByTagSlug(
  tagSlug: string,
  options: { limit?: number; offset?: number; activeOnly?: boolean } = {}
): Promise<MarketsResponse> {
  const eventsResponse = await fetchEventsByTagSlug(tagSlug, {
    limit: options.limit,
    offset: options.offset,
    closed: options.activeOnly ? false : undefined,
  });

  const markets = extractMarketsFromEvents(eventsResponse.events);

  return {
    markets: options.activeOnly ? filterActiveMarkets(markets) : markets,
    hasMore: eventsResponse.hasMore,
  };
}

/**
 * Discover markets by tag ID
 * Convenience: fetches events by tag ID, extracts markets
 */
export async function discoverMarketsByTagId(
  tagId: number,
  options: { limit?: number; offset?: number; activeOnly?: boolean } = {}
): Promise<MarketsResponse> {
  const eventsResponse = await fetchEventsByTagId(tagId, {
    limit: options.limit,
    offset: options.offset,
    closed: options.activeOnly ? false : undefined,
  });

  const markets = extractMarketsFromEvents(eventsResponse.events);

  return {
    markets: options.activeOnly ? filterActiveMarkets(markets) : markets,
    hasMore: eventsResponse.hasMore,
  };
}

/**
 * Discover all active markets
 * Fetches active events ordered by newest, extracts markets
 */
export async function discoverAllActiveMarkets(
  options: { limit?: number; offset?: number } = {}
): Promise<MarketsResponse> {
  const eventsResponse = await fetchActiveEvents({
    limit: options.limit,
    offset: options.offset,
  });

  const markets = extractMarketsFromEvents(eventsResponse.events);

  return {
    markets: filterActiveMarkets(markets),
    hasMore: eventsResponse.hasMore,
  };
}
