# Implementation Plan: Enhanced News Monitors

## Overview

Improve Parallel AI monitor webhooks to trigger on breaking news (hourly) and daily summaries across three categories: politics, sports, and crypto.

### Architecture

```
lib/parallel/
├── client.ts      # Add output_schema support to createMonitor()
├── monitors.ts    # Define 6 monitors (3 hourly + 3 daily)
└── types.ts       # Add structured output types

app/api/parallel/monitor/webhook/route.ts
└── Pass urgency/category context to agent trigger
```

---

## 1. Monitor Definitions

### Strategy: Strict Query + Structured Output

- **Hourly (Breaking)**: Strict queries defining exactly what "breaking" means with concrete examples. These should trigger rarely (0-2 times per day).
- **Daily (Summary)**: Comprehensive summaries of market-relevant news. Triggers once per day.

### Hourly Monitors (Breaking News)

```typescript
// Politics - hourly
{
  id: "politics-breaking",
  description: "Breaking political news with immediate market impact",
  enabled: true,
  cadence: "hourly",
  metadata: { category: "politics", type: "breaking" },
  query: `Detect ONLY major breaking political news that would immediately move prediction markets:
- Election results or significant polling shifts (5%+ change in major races)
- Major policy announcements (Fed rate decisions, executive orders, Supreme Court rulings)
- Unexpected political events (resignations, major scandals breaking, impeachment news)
- Geopolitical crises (military conflicts, diplomatic incidents, sanctions)
Do NOT report: routine political news, minor updates, opinion pieces, scheduled events, or incremental developments.`,
}

// Sports - hourly
{
  id: "sports-breaking",
  description: "Breaking sports news affecting betting markets",
  enabled: true,
  cadence: "hourly",
  metadata: { category: "sports", type: "breaking" },
  query: `Detect ONLY breaking sports news with immediate betting market impact:
- Star player injuries during or immediately before major games
- Unexpected trades of franchise players
- Game cancellations, postponements, or venue changes
- Breaking scandals (suspensions, investigations, doping violations)
- Coaching firings during season
Do NOT report: routine game results, practice reports, minor roster moves, post-game analysis, or scheduled announcements.`,
}

// Crypto - hourly
{
  id: "crypto-breaking",
  description: "Breaking crypto news with immediate market impact",
  enabled: true,
  cadence: "hourly",
  metadata: { category: "crypto", type: "breaking" },
  query: `Detect ONLY breaking cryptocurrency events with immediate market impact:
- Exchange hacks, exploits, or insolvency announcements
- Major regulatory actions (SEC lawsuits, ETF decisions, country-wide bans)
- Protocol failures, exploits, or security breaches over $10M
- Unexpected institutional moves (major fund purchases, corporate treasury changes)
- Stablecoin depegging events
Do NOT report: normal price fluctuations, routine updates, speculation, or minor protocol upgrades.`,
}
```

### Daily Monitors (Summaries)

```typescript
// Politics - daily
{
  id: "politics-daily",
  description: "Daily political news summary for prediction markets",
  enabled: true,
  cadence: "daily",
  metadata: { category: "politics", type: "daily" },
  query: `Summarize significant political developments relevant to prediction markets:
- Polling trends and changes in major races
- Legislative progress on significant bills
- Campaign developments and endorsements
- Regulatory and policy updates
- International political developments affecting US markets
Focus on actionable intelligence for prediction market trading.`,
}

// Sports - daily
{
  id: "sports-daily",
  description: "Daily sports news summary for betting markets",
  enabled: true,
  cadence: "daily",
  metadata: { category: "sports", type: "daily" },
  query: `Summarize significant sports developments relevant to betting markets:
- Team standings and playoff implications
- Injury reports and player status updates
- Upcoming high-profile matchups
- Team performance trends and streaks
- Trades, signings, and roster changes
Focus on information useful for sports prediction market analysis.`,
}

// Crypto - daily
{
  id: "crypto-daily",
  description: "Daily crypto news summary for prediction markets",
  enabled: true,
  cadence: "daily",
  metadata: { category: "crypto", type: "daily" },
  query: `Summarize cryptocurrency market developments relevant to prediction markets:
- Market trends and significant price movements
- Regulatory developments and upcoming decisions
- Protocol upgrades and ecosystem developments
- Institutional activity and adoption news
- Upcoming events (token unlocks, hard forks, governance votes)
Focus on tradeable insights for crypto prediction markets.`,
}
```

---

## 2. Structured Output Schema

Add to all monitors for consistent, machine-readable event data:

```typescript
// lib/parallel/types.ts

export interface NewsEventStructuredOutput {
  headline: string;      // Concise summary
  category: "politics" | "sports" | "crypto";
  urgency: "breaking" | "important" | "routine";
  sentiment: "bullish" | "bearish" | "neutral";
  tradeable: "yes" | "no";
  market_impact: string; // Brief description of potential market impact
}

export const NEWS_OUTPUT_SCHEMA = {
  type: "json",
  json_schema: {
    type: "object",
    properties: {
      headline: {
        type: "string",
        description: "Concise headline summarizing the news event (max 100 chars)"
      },
      category: {
        type: "string",
        description: "News category: politics, sports, or crypto"
      },
      urgency: {
        type: "string",
        description: "Urgency level: breaking (rare, immediate impact), important (notable), or routine (minor)"
      },
      sentiment: {
        type: "string",
        description: "Market sentiment implication: bullish, bearish, or neutral"
      },
      tradeable: {
        type: "string",
        description: "Whether this news is directly tradeable on prediction markets: yes or no"
      },
      market_impact: {
        type: "string",
        description: "Brief description of potential prediction market impact (max 200 chars)"
      }
    }
  }
};
```

---

## 3. Client Updates

### Update `createMonitor()` to support output schema

```typescript
// lib/parallel/client.ts

export async function createMonitor(
  config: MonitorConfig & { outputSchema?: object }
): Promise<MonitorCreateResponse> {
  // ...existing code...
  
  body: JSON.stringify({
    query: config.query,
    cadence: config.cadence,
    metadata: config.metadata,
    output_schema: config.outputSchema,  // NEW
    webhook: {
      url: PARALLEL_MONITOR_WEBHOOK_URL,
      event_types: [
        "monitor.event.detected",
        "monitor.execution.completed",
        "monitor.execution.failed",
      ],
    },
  }),
}
```

---

## 4. Webhook Handler Updates

### Pass category and urgency context to agent

```typescript
// app/api/parallel/monitor/webhook/route.ts

async function handleEventDetected(payload: MonitorWebhookPayload): Promise<NextResponse> {
  const { monitor_id, event, metadata } = payload.data;
  
  // ... fetch event group ...

  // Extract structured output if available
  const structuredResult = eventGroup.events[0]?.result?.content as NewsEventStructuredOutput | undefined;

  // Build enriched payload for agent
  const newsPayload: NewsEventPayload = {
    monitor_id,
    event_group_id: event.event_group_id,
    metadata,
    events: eventGroup.events,
    // NEW: Include parsed structured data
    context: {
      category: metadata?.category || structuredResult?.category,
      type: metadata?.type,  // "breaking" or "daily"
      urgency: structuredResult?.urgency,
      sentiment: structuredResult?.sentiment,
      tradeable: structuredResult?.tradeable === "yes",
    },
  };

  // Trigger agent with enriched context
  const triggerPayload = {
    triggerType: "news_event",
    newsEvent: newsPayload,
  };
  
  // ... rest of trigger logic ...
}
```

### Update `NewsEventPayload` type

```typescript
export interface NewsEventPayload {
  monitor_id: string;
  event_group_id: string;
  metadata?: Record<string, string>;
  events: Array<{
    output: string;
    event_date: string;
    source_urls: string[];
    result?: {
      type: string;
      content: NewsEventStructuredOutput;
    };
  }>;
  context?: {
    category?: string;
    type?: string;
    urgency?: string;
    sentiment?: string;
    tradeable?: boolean;
  };
}
```

---

## 5. Implementation Checklist

- [ ] Update `lib/parallel/types.ts`
  - [ ] Add `NewsEventStructuredOutput` interface
  - [ ] Add `NEWS_OUTPUT_SCHEMA` constant
  - [ ] Update `MonitorConfig` to include optional `outputSchema`
  - [ ] Update `MonitorEvent` to include optional `result` field

- [ ] Update `lib/parallel/client.ts`
  - [ ] Modify `createMonitor()` to accept and send `output_schema`

- [ ] Update `lib/parallel/monitors.ts`
  - [ ] Replace commented examples with 6 monitor definitions
  - [ ] Add `outputSchema: NEWS_OUTPUT_SCHEMA` to each monitor

- [ ] Update `app/api/parallel/monitor/webhook/route.ts`
  - [ ] Update `NewsEventPayload` interface with `context` field
  - [ ] Extract structured output from event data
  - [ ] Pass enriched context to agent trigger

- [ ] Create setup script (optional)
  - [ ] Script to create all enabled monitors via API
  - [ ] Script to list/delete existing monitors

---

## 6. Expected Behavior

| Monitor | Cadence | Trigger Frequency | Purpose |
|---------|---------|-------------------|---------|
| `politics-breaking` | Hourly | Rare (0-2/day) | Major political events |
| `sports-breaking` | Hourly | Rare (0-2/day) | Star injuries, trades |
| `crypto-breaking` | Hourly | Rare (0-2/day) | Hacks, regulations |
| `politics-daily` | Daily | 1/day | Political summary |
| `sports-daily` | Daily | 1/day | Sports summary |
| `crypto-daily` | Daily | 1/day | Crypto summary |

The hourly monitors use strict queries so they only fire on truly breaking news. The daily monitors provide regular market intelligence.
