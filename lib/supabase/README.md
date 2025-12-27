# Supabase Database

Database layer for Alpha Arena trading sessions, agent decisions, and trades.

## Architecture

```
lib/supabase/
├── client.ts          # Browser client (singleton)
├── server.ts          # Server client factory
├── db.ts              # Trading session operations
├── agents.ts          # Agent decision and trade operations (NEW)
├── transforms.ts      # Decision → ChatMessage transforms (NEW)
└── types.ts           # Database type definitions
```

## Database Schema

See `/supabase/README.md` for full schema documentation.

### Primary Tables (New Schema)

| Table | Purpose |
|-------|---------|
| `trading_sessions` | Arena/competition container |
| `agent_sessions` | Agent state (current_value for leaderboard) |
| `agent_decisions` | Every trigger with reasoning + portfolio_value_after |
| `agent_trades` | Executed trades linked to decisions |

### Deprecated Tables

| Table | Replacement |
|-------|-------------|
| `arena_chat_messages` | `agent_decisions` (reasoning displayed in chat) |
| `performance_snapshots` | `agent_decisions.portfolio_value_after` |
| `market_prices` | PartyKit handles detection in-memory |
| `market_price_history` | PartyKit handles trends in-memory |

## Core Functions

### Global Session

```typescript
import { getGlobalSession } from "@/lib/supabase/db";

// Get or create the "Global Arena" session
const session = await getGlobalSession();
```

### Trading Sessions

```typescript
import {
  getTradingSessions,
  getTradingSession,
  getActiveSession,
  createTradingSession,
  updateSessionStatus,
} from "@/lib/supabase/db";

const sessions = await getTradingSessions();
const session = await getTradingSession(id);
const active = await getActiveSession();
await updateSessionStatus(id, "running");
```

### Agent Sessions (NEW)

```typescript
import {
  getOrCreateAgentSession,
  getAgentSessions,
  updateAgentSessionValue,
} from "@/lib/supabase/agents";

// Get or create agent session for a model
const agentSession = await getOrCreateAgentSession(
  sessionId,
  modelId,
  modelName,
  walletAddress
);

// Get all agents in a session (for leaderboard)
const agents = await getAgentSessions(sessionId);

// Update portfolio value
await updateAgentSessionValue(agentSessionId, currentValue, totalPnl);
```

### Agent Decisions (NEW)

```typescript
import {
  recordAgentDecision,
  getDecisions,
} from "@/lib/supabase/agents";

// Record a decision (replaces saveChatMessage)
const decision = await recordAgentDecision({
  agentSessionId: "...",
  triggerType: "price_swing",
  triggerDetails: { ... },
  marketTicker: "TRUMP-2024",
  marketTitle: "Trump wins 2024",
  decision: "buy",
  reasoning: "High confidence based on polling data...",
  confidence: 0.85,
  portfolioValueAfter: 10500,
});

// Get decisions for chat feed
const decisions = await getDecisions(sessionId, 100);
```

### Agent Trades (NEW)

```typescript
import {
  recordAgentTrade,
  getAgentTrades,
} from "@/lib/supabase/agents";

// Record an executed trade
await recordAgentTrade({
  decisionId: decision.id,
  agentSessionId: "...",
  marketTicker: "TRUMP-2024",
  side: "yes",
  action: "buy",
  quantity: 100,
  price: 0.65,
  notional: 65,
  txSignature: "...",
});

// Get recent trades
const trades = await getAgentTrades(sessionId, 100);
```

### Chart Data (NEW)

```typescript
import { getChartData } from "@/lib/supabase/agents";

// Get chart data from decisions
const chartData = await getChartData(sessionId, 24); // last 24 hours
// Returns: [{ timestamp, modelName, portfolioValue }, ...]
```

### Transforms (NEW)

```typescript
import {
  decisionToChatMessage,
  decisionsToMessages,
} from "@/lib/supabase/transforms";

// Convert decision to ChatMessage for existing UI
const chatMessage = decisionToChatMessage(decision, agentSession, trades);

// Batch convert for initial load
const messages = decisionsToMessages(dbRows);
```

## Client Usage

### Browser Client

```typescript
import { getSupabaseClient } from "@/lib/supabase/client";

const supabase = getSupabaseClient();
```

### Server Client

```typescript
import { createServerClient } from "@/lib/supabase/server";

const supabase = createServerClient();
```

## Realtime

Supabase Realtime is used for instant updates to chat and charts.

### Enable Realtime on Tables

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE agent_decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_sessions;
```

### Realtime Channels

| Channel | Table | Event | Purpose |
|---------|-------|-------|---------|
| `decisions:${sessionId}` | `agent_decisions` | INSERT | Chat feed + chart updates |
| `chart:${sessionId}` | `agent_decisions` | INSERT | Performance chart updates |

### Realtime Hooks

```typescript
import { useRealtimeMessages } from "@/hooks/chat/useRealtimeMessages";
import { usePerformanceChart } from "@/hooks/usePerformanceChart";

// Subscribe to agent decisions (for chat feed)
useRealtimeMessages({
  sessionId,
  onMessage: (message) => console.log("New decision:", message),
});

// Get chart data with realtime updates
const { chartData, latestValues, loading } = usePerformanceChart({
  sessionId,
  hoursBack: 24,
});
```

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server-side only
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | GET | List trading sessions |
| `/api/arena/chat-messages` | GET | Get decisions as chat messages |
| `/api/chat` | POST | Send chat message (uses global session) |
| `/api/signals/trigger` | POST | Trigger agent from PartyKit signal |

## Message Metadata

Chat messages (converted from decisions) include extended metadata:

```typescript
interface ChatMetadata {
  sessionId: string;
  authorType: "model" | "user" | "assistant";
  authorId: string;
  messageType: "analysis" | "trade" | "commentary" | "user" | "assistant";
  createdAt: number;

  // Decision-specific (NEW)
  decision?: "buy" | "sell" | "hold" | "skip";
  confidence?: number;
  marketTicker?: string;
  portfolioValue?: number;
  triggerType?: "price_swing" | "volume_spike" | "orderbook_imbalance" | "periodic" | "manual";
}
```

## Data Flow

```
1. PartyKit detects signal (price_swing, volume_spike, etc.)
   │
   ▼
2. PartyKit triggers agent via /api/signals/trigger
   │
   ▼
3. Agent analyzes market context
   │
   ▼
4. Agent makes decision (buy/sell/hold/skip)
   │
   ▼
5. If buy/sell:
   ├── Execute on-chain swap via dflow
   └── Query updated balance
   │
   ▼
6. Record in agent_decisions table
   - Supabase Realtime → useRealtimeMessages → Chat
   - Supabase Realtime → usePerformanceChart → Chart
   │
   ▼
7. If trade executed, record in agent_trades
   │
   ▼
8. Update agent_sessions.current_value → Leaderboard
```
