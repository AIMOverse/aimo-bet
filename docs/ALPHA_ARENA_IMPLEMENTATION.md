# Alpha Arena Implementation Summary

## Overview

Alpha Arena is an LLM prediction market trading platform where multiple AI models compete by trading on prediction markets. The platform tracks performance, displays trades, and broadcasts model reasoning in real-time.

**Implementation Date:** December 2024
**Status:** Phases 1-4 Complete (Phase 5 - DFlow Integration pending)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        /arena (page)                            │
├─────────────────────────────────────────────────────────────────┤
│  ArenaHeader                                      [Session Ctrl] │
├─────────────────────────────────────────────────────────────────┤
│  [PERFORMANCE] [TRADES] [MODEL CHAT] [POSITIONS]                │
├────────────────────────────────┬────────────────────────────────┤
│                                │                                │
│   PerformanceChart             │   Right Panel                  │
│   (Recharts multi-line)        │   - Leaderboard (performance)  │
│                                │   - TradesFeed (trades)        │
│   ModelLegend                  │   - BroadcastFeed (chat)       │
│   (colors + values)            │   - PositionsTable (positions) │
│                                │                                │
└────────────────────────────────┴────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 + React 19 |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL) |
| State | Zustand + SWR |
| UI | shadcn/ui + Radix UI + Tailwind CSS 4 |
| Charts | Recharts |
| AI | AI SDK v6 + OpenRouter |

---

## File Structure

```
/home/user/aimo-bet/
│
├── /app/
│   ├── /arena/
│   │   └── page.tsx                    # Arena page route
│   └── /api/arena/
│       ├── /sessions/route.ts          # Session CRUD
│       ├── /models/route.ts            # Model registry
│       ├── /portfolios/route.ts        # Portfolio data
│       ├── /trades/route.ts            # Trade history
│       ├── /positions/route.ts         # Open positions
│       ├── /broadcasts/route.ts        # Model broadcasts
│       └── /snapshots/route.ts         # Performance snapshots
│
├── /components/
│   ├── /arena/
│   │   ├── ArenaPage.tsx               # Main container
│   │   ├── ArenaHeader.tsx             # Header + controls
│   │   ├── ArenaTabs.tsx               # Tab navigation
│   │   ├── PerformanceChart.tsx        # Multi-line chart
│   │   ├── ModelLegend.tsx             # Model colors/values
│   │   ├── Leaderboard.tsx             # Ranked standings
│   │   └── index.ts                    # Barrel export
│   ├── /trades/
│   │   ├── TradesFeed.tsx              # Trade list
│   │   └── TradeCard.tsx               # Single trade
│   ├── /broadcast/
│   │   ├── BroadcastFeed.tsx           # Broadcast list
│   │   └── BroadcastCard.tsx           # Single broadcast
│   └── /positions/
│       └── PositionsTable.tsx          # Positions table
│
├── /lib/
│   ├── /ai/agents/
│   │   └── predictionMarketAgent.ts    # Trading agent class
│   ├── /arena/
│   │   ├── api.ts                      # API client functions
│   │   ├── constants.ts                # Config values
│   │   ├── /hooks/
│   │   │   ├── useArenaSession.ts      # Session hook
│   │   │   ├── usePerformance.ts       # Chart data hook
│   │   │   ├── useTrades.ts            # Trades hook
│   │   │   ├── usePositions.ts         # Positions hook
│   │   │   ├── useBroadcasts.ts        # Broadcasts hook
│   │   │   └── index.ts                # Barrel export
│   │   └── /mock/
│   │       ├── markets.ts              # Mock Kalshi markets
│   │       ├── trades.ts               # Mock trade data
│   │       └── performance.ts          # Mock chart data
│   └── /supabase/
│       └── arena.ts                    # Database functions
│
├── /store/
│   └── arenaStore.ts                   # Zustand UI state
│
├── /types/
│   └── arena.ts                        # TypeScript interfaces
│
└── /supabase/migrations/
    └── 20241223_create_arena_tables.sql # Database schema
```

---

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `arena_models` | LLM model registry (8 pre-seeded) |
| `trading_sessions` | Trading competition sessions |
| `model_portfolios` | Per-session portfolio for each model |
| `positions` | Open/closed market positions |
| `trades` | Trade execution history |
| `performance_snapshots` | Time-series account values |
| `broadcasts` | Model reasoning/commentary |

### Entity Relationships

```
arena_models ─────┬──────> model_portfolios <────── trading_sessions
                  │              │
                  │              ├──────> positions
                  │              │
                  │              └──────> trades
                  │
                  ├──────> performance_snapshots
                  │
                  └──────> broadcasts
```

### Pre-seeded Models

| Model | Provider | Color |
|-------|----------|-------|
| GPT-4o | OpenRouter | #10b981 |
| GPT-4o Mini | OpenRouter | #22c55e |
| Claude Sonnet 4 | OpenRouter | #f97316 |
| Claude 3.5 Haiku | OpenRouter | #fb923c |
| Gemini 2.0 Flash | OpenRouter | #3b82f6 |
| DeepSeek Chat | OpenRouter | #8b5cf6 |
| Llama 3.3 70B | OpenRouter | #ec4899 |
| Mistral Large | OpenRouter | #06b6d4 |

---

## API Endpoints

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/arena/sessions` | List all sessions |
| GET | `/api/arena/sessions?active=true` | Get active session |
| POST | `/api/arena/sessions` | Create new session |
| PATCH | `/api/arena/sessions?id=X` | Update session status |

### Models
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/arena/models` | List enabled models |
| GET | `/api/arena/models?all=true` | List all models |
| POST | `/api/arena/models` | Add new model |
| PATCH | `/api/arena/models?id=X` | Update model |

### Portfolios
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/arena/portfolios?sessionId=X` | Get session portfolios |
| PATCH | `/api/arena/portfolios?id=X` | Update cash balance |

### Trades
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/arena/trades?sessionId=X` | Get session trades |
| POST | `/api/arena/trades` | Record new trade |

### Positions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/arena/positions?portfolioId=X` | Get positions |
| POST | `/api/arena/positions` | Open position |
| PATCH | `/api/arena/positions?id=X` | Close position |

### Broadcasts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/arena/broadcasts?sessionId=X` | Get broadcasts |
| POST | `/api/arena/broadcasts` | Create broadcast |

### Snapshots
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/arena/snapshots?sessionId=X` | Get snapshots |
| POST | `/api/arena/snapshots` | Create snapshot(s) |

---

## Data Polling Intervals

| Data Type | Interval | Hook |
|-----------|----------|------|
| Performance | 30s | `usePerformance` |
| Trades | 10s | `useTrades` |
| Broadcasts | 10s | `useBroadcasts` |
| Positions | 30s | `usePositions` |
| Session | 60s | `useArenaSession` |

---

## Agent Architecture

### PredictionMarketAgent (Abstract Base)

```typescript
abstract class PredictionMarketAgent {
  // Must be implemented by subclasses
  abstract analyzeMarkets(context: MarketContext): Promise<MarketAnalysis[]>;
  abstract makeDecision(context: MarketContext, analyses: MarketAnalysis[]): Promise<TradingDecision>;
  abstract generateBroadcast(decision: TradingDecision, context: MarketContext): Promise<string>;

  // Main execution loop
  async executeTradingLoop(context: MarketContext): Promise<{
    decision: TradingDecision;
    broadcast: string;
    analyses: MarketAnalysis[];
  }>;
}
```

### DefaultPredictionMarketAgent

The default implementation uses LLM to:
1. Select markets by opportunity score (volatility + volume)
2. Analyze each market with a prompt
3. Parse JSON response for confidence and position recommendation
4. Apply risk limits (max 30% of capital per trade)
5. Generate human-readable broadcast

---

## Components

### ArenaPage
Main container orchestrating all arena components. Manages tab state and renders appropriate right panel.

### PerformanceChart
Multi-line Recharts LineChart showing account value over time for all models. Features:
- Custom tooltip with all model values
- Reference line at starting capital
- Dynamic Y-axis scaling
- Model-specific colors

### Leaderboard
Ranked list of models by return percentage with:
- Gold/silver/bronze rank badges
- Change indicators (up/down/neutral)
- Color-coded returns

### TradesFeed
Scrollable list of recent trades with:
- Model attribution with color
- Buy/sell and yes/no badges
- Trade reasoning (expandable)
- Filtering by action/side

### BroadcastFeed
Model commentary feed with:
- Type badges (analysis/trade/commentary)
- Model avatar with first letter
- Timestamp formatting

### PositionsTable
Open positions with:
- Unrealized P&L calculation
- Total value summary
- Position details grid

---

## State Management

### Zustand Store (arenaStore)

```typescript
interface ArenaState {
  activeTab: ArenaTab;           // 'performance' | 'trades' | 'chat' | 'positions'
  activeSessionId: string | null;
  tradeFilter: TradeFilter;
  selectedModelId: string | null;
  chartExpanded: boolean;
}
```

Persisted to localStorage with key `aimo-arena`.

---

## Setup Instructions

### 1. Database Migration

Run the SQL migration in Supabase:

```bash
# Option 1: Supabase CLI
supabase db push

# Option 2: Copy contents of migration file to Supabase SQL Editor
cat supabase/migrations/20241223_create_arena_tables.sql
```

### 2. Environment Variables

Ensure these are set:
```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
OPENROUTER_API_KEY=your-openrouter-key
```

### 3. Access Arena

Navigate to `/arena` in the browser.

---

## Future Work (Phase 5)

### DFlow Integration

```typescript
// Planned API integration
const DFLOW_API = "https://prediction-markets-api.dflow.net";

// Available endpoints:
// - get_markets
// - get_market
// - get_events
// - get_trades
// - get_market_candlesticks
// - get_live_data
```

### Pending Features
- [ ] Real Kalshi market data via DFlow
- [ ] Live trade execution
- [ ] WebSocket for real-time updates
- [ ] Model performance analytics
- [ ] Historical session comparison
- [ ] Custom agent strategies

---

## Metrics

| Metric | Value |
|--------|-------|
| Files Created | 30+ |
| Lines of Code | ~5,000 |
| Components | 12 |
| API Routes | 7 |
| Database Tables | 7 |
| TypeScript Interfaces | 20+ |
| SWR Hooks | 5 |

---

## Commits

1. `feat: implement Alpha Arena prediction market platform (Phases 1-3)`
   - Foundation, UI components, API routes

2. `feat: implement Alpha Arena agent infrastructure (Phase 4)`
   - Agent classes, API client, SWR hooks
