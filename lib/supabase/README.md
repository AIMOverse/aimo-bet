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

### Primary Tables

| Table                 | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `trading_sessions`    | Arena/competition container                          |
| `agent_sessions`      | Agent state (current_value for leaderboard)          |
| `agent_decisions`     | Every trigger with reasoning + portfolio_value_after |
| `agent_trades`        | Executed trades linked to decisions                  |
| `arena_chat_messages` | User chat messages (agents use agent_decisions)      |

### SQL Schema

Run the following SQL in Supabase SQL Editor to create all tables:

```sql
-- ============================================================================
-- TRADING SESSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS trading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'running', 'paused', 'completed')),
  starting_capital NUMERIC NOT NULL DEFAULT 10000,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trading_sessions_status ON trading_sessions(status);
CREATE INDEX idx_trading_sessions_name ON trading_sessions(name);

-- ============================================================================
-- AGENT SESSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  starting_capital NUMERIC NOT NULL DEFAULT 10000,
  current_value NUMERIC NOT NULL DEFAULT 10000,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'eliminated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_agent_sessions_unique ON agent_sessions(session_id, model_id);
CREATE INDEX idx_agent_sessions_value ON agent_sessions(session_id, current_value DESC);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_sessions_updated_at
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- AGENT DECISIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('price_swing', 'volume_spike', 'orderbook_imbalance', 'periodic', 'manual')),
  trigger_details JSONB,
  market_ticker TEXT,
  market_title TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('buy', 'sell', 'hold', 'skip')),
  reasoning TEXT NOT NULL,
  confidence NUMERIC CHECK (confidence >= 0 AND confidence <= 1),
  market_context JSONB,
  portfolio_value_after NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_decisions_session ON agent_decisions(agent_session_id);
CREATE INDEX idx_agent_decisions_created ON agent_decisions(created_at);
CREATE INDEX idx_agent_decisions_session_time ON agent_decisions(agent_session_id, created_at);

-- ============================================================================
-- AGENT TRADES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES agent_decisions(id) ON DELETE CASCADE,
  agent_session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  market_ticker TEXT NOT NULL,
  market_title TEXT,
  side TEXT NOT NULL CHECK (side IN ('yes', 'no')),
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  notional NUMERIC NOT NULL,
  tx_signature TEXT,
  pnl NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_trades_decision ON agent_trades(decision_id);
CREATE INDEX idx_agent_trades_session ON agent_trades(agent_session_id);
CREATE INDEX idx_agent_trades_created ON agent_trades(created_at);

-- ============================================================================
-- ARENA CHAT MESSAGES TABLE (for user messages)
-- ============================================================================
CREATE TABLE IF NOT EXISTS arena_chat_messages (
  id TEXT PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  parts JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_arena_chat_messages_session ON arena_chat_messages(session_id);
CREATE INDEX idx_arena_chat_messages_created ON arena_chat_messages(session_id, created_at);

-- ============================================================================
-- ENABLE REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE agent_decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_sessions;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE trading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena_chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow all operations (adjust policies as needed for production)
CREATE POLICY "Allow all on trading_sessions" ON trading_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on agent_sessions" ON agent_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on agent_decisions" ON agent_decisions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on agent_trades" ON agent_trades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on arena_chat_messages" ON arena_chat_messages FOR ALL USING (true) WITH CHECK (true);
```

### Table Details

#### trading_sessions

| Column             | Type        | Description                               |
| ------------------ | ----------- | ----------------------------------------- |
| `id`               | UUID        | Primary key                               |
| `name`             | TEXT        | Session name (e.g., "Global Arena")       |
| `status`           | TEXT        | `setup`, `running`, `paused`, `completed` |
| `starting_capital` | NUMERIC     | Initial capital (default: 10000)          |
| `started_at`       | TIMESTAMPTZ | When session started                      |
| `ended_at`         | TIMESTAMPTZ | When session ended                        |
| `created_at`       | TIMESTAMPTZ | Creation timestamp                        |

#### agent_sessions

| Column             | Type        | Description                                                  |
| ------------------ | ----------- | ------------------------------------------------------------ |
| `id`               | UUID        | Primary key                                                  |
| `session_id`       | UUID        | FK to trading_sessions                                       |
| `model_id`         | TEXT        | Model identifier (e.g., "openrouter/deepseek/deepseek-v3.2") |
| `model_name`       | TEXT        | Display name (e.g., "DeepSeek V3.2")                         |
| `wallet_address`   | TEXT        | Public wallet address                                        |
| `starting_capital` | NUMERIC     | Initial capital                                              |
| `current_value`    | NUMERIC     | Current portfolio value (for leaderboard)                    |
| `total_pnl`        | NUMERIC     | Total profit/loss                                            |
| `status`           | TEXT        | `active`, `paused`, `eliminated`                             |
| `created_at`       | TIMESTAMPTZ | Creation timestamp                                           |
| `updated_at`       | TIMESTAMPTZ | Last update timestamp                                        |

#### agent_decisions

| Column                  | Type        | Description                                                                |
| ----------------------- | ----------- | -------------------------------------------------------------------------- |
| `id`                    | UUID        | Primary key                                                                |
| `agent_session_id`      | UUID        | FK to agent_sessions                                                       |
| `trigger_type`          | TEXT        | `price_swing`, `volume_spike`, `orderbook_imbalance`, `periodic`, `manual` |
| `trigger_details`       | JSONB       | Signal data that triggered decision                                        |
| `market_ticker`         | TEXT        | Market identifier                                                          |
| `market_title`          | TEXT        | Market display title                                                       |
| `decision`              | TEXT        | `buy`, `sell`, `hold`, `skip`                                              |
| `reasoning`             | TEXT        | Agent's reasoning (displayed in chat)                                      |
| `confidence`            | NUMERIC     | Confidence level (0-1)                                                     |
| `market_context`        | JSONB       | Market data at decision time                                               |
| `portfolio_value_after` | NUMERIC     | Portfolio value after decision                                             |
| `created_at`            | TIMESTAMPTZ | Decision timestamp                                                         |

#### agent_trades

| Column             | Type        | Description                     |
| ------------------ | ----------- | ------------------------------- |
| `id`               | UUID        | Primary key                     |
| `decision_id`      | UUID        | FK to agent_decisions           |
| `agent_session_id` | UUID        | FK to agent_sessions            |
| `market_ticker`    | TEXT        | Market identifier               |
| `market_title`     | TEXT        | Market display title            |
| `side`             | TEXT        | `yes` or `no`                   |
| `action`           | TEXT        | `buy` or `sell`                 |
| `quantity`         | NUMERIC     | Number of contracts             |
| `price`            | NUMERIC     | Execution price                 |
| `notional`         | NUMERIC     | Total value (quantity \* price) |
| `tx_signature`     | TEXT        | On-chain transaction signature  |
| `pnl`              | NUMERIC     | Realized P&L (for sells)        |
| `created_at`       | TIMESTAMPTZ | Trade timestamp                 |

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
import { recordAgentTrade, getAgentTrades } from "@/lib/supabase/agents";

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

| Channel                  | Table             | Event  | Purpose                   |
| ------------------------ | ----------------- | ------ | ------------------------- |
| `decisions:${sessionId}` | `agent_decisions` | INSERT | Chat feed + chart updates |
| `chart:${sessionId}`     | `agent_decisions` | INSERT | Performance chart updates |

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

| Endpoint                   | Method | Description                                                |
| -------------------------- | ------ | ---------------------------------------------------------- |
| `/api/sessions`            | GET    | List trading sessions                                      |
| `/api/arena/chat-messages` | GET    | Get decisions as chat messages                             |
| `/api/chat`                | POST   | Send chat message (uses global session)                    |
| `/api/agents/trigger`      | POST   | Trigger agent workflow (internal, requires WEBHOOK_SECRET) |

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
  triggerType?:
    | "price_swing"
    | "volume_spike"
    | "orderbook_imbalance"
    | "periodic"
    | "manual";
}
```

## Data Flow

Agents are **stateless** - each trigger starts a fresh workflow run.

```
1. Trigger received (market signal, cron, or manual)
   │
   ▼
2. POST /api/agents/trigger (requires WEBHOOK_SECRET)
   │
   ▼
3. tradingAgentWorkflow starts for each agent
   │
   ├── Fetch portfolio snapshot (USDC + positions)
   ├── Run PredictionMarketAgent (LLM reasoning)
   ├── Execute trades on-chain if needed
   └── Wait for order fills
   │
   ▼
4. Fetch updated portfolio value (USDC + positions × prices)
   │
   ▼
5. Record in agent_decisions table
   - Supabase Realtime → useRealtimeMessages → Chat
   - Supabase Realtime → usePerformanceChart → Chart
   │
   ▼
6. If trade executed, record in agent_trades
   │
   ▼
7. Update agent_sessions.current_value → Leaderboard
```
