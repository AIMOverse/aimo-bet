# discoverEvent Tool Implementation Plan

Event-centric market discovery tool using dflow Prediction Market Metadata API.

---

## Overview

Replace mock market-discovery tools with a single unified `discoverEvent` tool that returns events with nested markets.

### Current State (Mock Tools - To Remove)
```
lib/ai/tools/market-discovery/
├── getMarkets.ts       # List markets via API route (mock)
├── getMarketDetails.ts # Get market details via API route (mock)
├── getLiveData.ts      # Get live prices via API route (mock)
└── index.ts
```

### Target State
```
lib/ai/tools/
├── discoverEvent.ts    # Event-centric discovery (new)
├── increasePosition.ts # (already implemented)
├── decreasePosition.ts # (already implemented)
├── retrievePosition.ts # (already implemented)
├── redeemPosition.ts   # (already implemented)
└── utils/
    └── resolveMints.ts # (already implemented)
```

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Return unit | Event (with nested markets) | Provides context; LLM understands what it's betting on |
| Price inclusion | Indicative prices with caveats | Agent needs prices to reason, but must know they're stale |
| Filter approach | Single tool with flexible params | LLM-native; minimizes tool calls |
| Error handling | Return suggestions on failure | Agent can self-correct without user intervention |

---

## Tool Specification

### `discoverEvent`

**Purpose:** Discover prediction market events with nested markets. Primary discovery tool for the agent.

**File:** `lib/ai/tools/discoverEvent.ts`

**Input Schema:**
```typescript
z.object({
  // Search/filter options (all optional)
  query: z.string().optional()
    .describe("Search terms to match against event/market titles"),
  
  category: z.string().optional()
    .describe("Filter by category: crypto, sports, politics, entertainment"),
  
  tags: z.array(z.string()).optional()
    .describe("Filter by tags (e.g., ['bitcoin', 'price'])"),
  
  series_ticker: z.string().optional()
    .describe("Filter to specific series (e.g., 'BTCD-DAILY')"),
  
  event_ticker: z.string().optional()
    .describe("Get details for a specific event by ticker"),
  
  status: z.enum(["active", "initialized", "determined", "finalized"]).optional()
    .default("active")
    .describe("Filter by market status (default: active)"),
  
  // Pagination
  limit: z.number().min(1).max(50).optional().default(10)
    .describe("Maximum events to return (default: 10, max: 50)"),
  
  cursor: z.string().optional()
    .describe("Pagination cursor from previous response"),
})
```

**Output Schema:**
```typescript
interface DiscoverEventResult {
  success: boolean;
  
  events: Array<{
    // Event identification
    event_ticker: string;
    event_title: string;
    event_subtitle?: string;
    
    // Series context
    series_ticker: string;
    series_title?: string;
    category?: string;
    tags?: string[];
    
    // Nested markets
    markets: Array<{
      market_ticker: string;
      title: string;
      status: "active" | "initialized" | "determined" | "finalized";
      
      // Token addresses (for trading tools)
      yes_mint: string;
      no_mint: string;
      
      // Indicative prices (point-in-time snapshot)
      indicative_prices?: {
        yes: number;        // 0-1
        no: number;         // 0-1
        timestamp: string;  // ISO timestamp
      };
      
      // Market metrics
      volume_24h?: number;
      open_interest?: number;
      
      // Resolution info (if determined/finalized)
      result?: "yes" | "no";
    }>;
    
    // Event-level summary
    market_count: number;
    total_volume?: number;
  }>;
  
  // Response metadata
  total_events: number;
  total_markets: number;
  filters_applied: Record<string, unknown>;
  
  // Pagination
  cursor?: string;
  has_more: boolean;
  
  // Price caveat (always included when prices present)
  price_note: "Prices are indicative snapshots. Actual execution prices may differ.";
  prices_as_of?: string;  // ISO timestamp
  
  // Discovery helpers (for follow-up queries)
  available_categories?: string[];
  available_series?: Array<{ ticker: string; title: string }>;
  
  // Error handling
  error?: string;
  suggestion?: string;  // e.g., "Did you mean 'crypto'?"
}
```

---

## Implementation Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    discoverEvent Tool                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Parse & validate input                                   │
│     └─ Apply defaults (status: "active", limit: 10)          │
│                                                              │
│  2. Route by filter type:                                    │
│     ├─ event_ticker provided?                                │
│     │   └─ Fetch single event directly                       │
│     │                                                        │
│     ├─ category or tags provided?                            │
│     │   └─ fetchSeriesByCategory() / fetchSeriesByTags()     │
│     │   └─ Extract series tickers                            │
│     │   └─ fetchEventsBySeries(tickers)                      │
│     │                                                        │
│     ├─ series_ticker provided?                               │
│     │   └─ fetchEventsBySeries(series_ticker)                │
│     │                                                        │
│     └─ No filters (browse mode)?                             │
│         └─ fetchActiveEvents(limit)                          │
│                                                              │
│  3. Client-side query filtering (if query provided)          │
│     └─ Filter events/markets by title match                  │
│                                                              │
│  4. Fetch indicative prices (optional, if time permits)      │
│     └─ Batch fetch from live data endpoint                   │
│     └─ Attach to markets with timestamp                      │
│                                                              │
│  5. Transform to output schema                               │
│     └─ Event-centric with nested markets                     │
│     └─ Include token addresses (yes_mint, no_mint)           │
│                                                              │
│  6. Add discovery helpers                                    │
│     └─ available_categories (from fetchTagsByCategories)     │
│     └─ available_series (from response)                      │
│                                                              │
│  7. Return with pagination info                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## dflow Functions Used

From `lib/dflow/prediction-markets/discover.ts`:

| Function | Usage |
|----------|-------|
| `fetchEvents()` | Core event fetching with `withNestedMarkets: true` |
| `fetchActiveEvents()` | Browse active markets |
| `fetchEventsBySeries()` | Filter by series tickers |
| `fetchSeriesByCategory()` | Category → series resolution |
| `fetchSeriesByTags()` | Tags → series resolution |
| `fetchTagsByCategories()` | Get available categories (for suggestions) |
| `filterActiveMarkets()` | Helper for status filtering |
| `extractMarketTokens()` | Extract mint addresses |

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Invalid category | `{ success: false, error: "No markets found for category 'cryptoo'", suggestion: "Did you mean 'crypto'?", available_categories: [...] }` |
| No results | `{ success: true, events: [], suggestion: "Try broadening your search", available_categories: [...] }` |
| API error | `{ success: false, error: "dflow API error: ..." }` |
| Rate limited | `{ success: false, error: "Rate limited. Try again in a few seconds." }` |

---

## Example Usage

### Browse active markets
```typescript
discoverEvent({})
// Returns: 10 active events with markets
```

### Filter by category
```typescript
discoverEvent({ category: "crypto" })
// Returns: Crypto events with BTC, ETH, etc. markets
```

### Search by query
```typescript
discoverEvent({ query: "bitcoin price" })
// Returns: Events matching "bitcoin price" in title
```

### Get specific event
```typescript
discoverEvent({ event_ticker: "BTCD-25DEC0313" })
// Returns: Single event with all its markets
```

### Drill down by series
```typescript
discoverEvent({ series_ticker: "BTCD-DAILY", limit: 5 })
// Returns: 5 most recent Bitcoin daily events
```

---

## Files to Modify

### Create
- `lib/ai/tools/discoverEvent.ts` - Main tool implementation

### Update
- `lib/ai/tools/index.ts` - Export `discoverEventTool`, remove old exports

### Remove
- `lib/ai/tools/market-discovery/getMarkets.ts`
- `lib/ai/tools/market-discovery/getMarketDetails.ts`
- `lib/ai/tools/market-discovery/getLiveData.ts`
- `lib/ai/tools/market-discovery/index.ts`
- `lib/ai/tools/market-discovery/` (directory)

---

## Implementation Checklist

- [ ] Create `discoverEvent.ts` with input schema
- [ ] Implement routing logic for different filter types
- [ ] Add client-side query filtering
- [ ] Transform dflow response to event-centric output
- [ ] Add indicative prices with timestamps
- [ ] Include discovery helpers (available_categories, available_series)
- [ ] Add pagination support (cursor, has_more)
- [ ] Implement error handling with suggestions
- [ ] Update `lib/ai/tools/index.ts`
- [ ] Remove old `market-discovery/` directory
- [ ] Test with various filter combinations
