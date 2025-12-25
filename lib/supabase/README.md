# Supabase Database

Database layer for Alpha Arena trading sessions, performance tracking, and chat.

## Architecture

```
lib/supabase/
├── client.ts          # Browser client (singleton)
├── server.ts          # Server client factory
├── db.ts              # Database operations
├── prices.ts          # Price storage and swing detection
└── types.ts           # Database type definitions
```

## Database Schema

### trading_sessions

Stores arena trading sessions. A global "Global Arena" session always exists.

```sql
CREATE TABLE trading_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  status TEXT NOT NULL DEFAULT 'setup' 
    CHECK (status IN ('setup', 'running', 'paused', 'completed')),
  starting_capital NUMERIC NOT NULL DEFAULT 10000,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### performance_snapshots

Tracks model account values over time for performance charts.

```sql
CREATE TABLE performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  account_value NUMERIC NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### arena_chat_messages

Unified chat storage for model broadcasts, user questions, and assistant responses.

```sql
CREATE TABLE arena_chat_messages (
  id TEXT PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  parts JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### market_prices

Current price snapshot for swing detection.

```sql
CREATE TABLE market_prices (
  ticker TEXT PRIMARY KEY,
  yes_bid NUMERIC,
  yes_ask NUMERIC,
  no_bid NUMERIC,
  no_ask NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### market_price_history

Historical prices for trend analysis.

```sql
CREATE TABLE market_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT,
  yes_mid NUMERIC,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
```

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

### Chat Messages

```typescript
import {
  getChatMessages,
  saveChatMessage,
  saveChatMessages,
} from "@/lib/supabase/db";

const messages = await getChatMessages(sessionId, limit);
await saveChatMessage(message);
await saveChatMessages(messages);
```

### Performance Snapshots

```typescript
import {
  getPerformanceSnapshots,
  createPerformanceSnapshot,
  createBulkSnapshots,
} from "@/lib/supabase/db";

const snapshots = await getPerformanceSnapshots(sessionId, hoursBack);
await createPerformanceSnapshot(sessionId, modelId, accountValue);
await createBulkSnapshots([{ sessionId, modelId, accountValue }]);
```

### Price Swing Detection

```typescript
import {
  syncPricesAndDetectSwings,
  detectPriceSwings,
  getStoredPrices,
  updateStoredPrices,
} from "@/lib/supabase/prices";

// Sync prices and detect swings in one operation
const swings = await syncPricesAndDetectSwings(currentPrices, threshold);

// Manual swing detection
const storedPrices = await getStoredPrices();
const swings = detectPriceSwings(currentPrices, storedPrices, 0.05);
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

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server-side only
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/arena/sessions` | GET | List trading sessions |
| `/api/arena/sessions` | POST | Create new session |
| `/api/arena/snapshots` | GET | Get performance snapshots |
| `/api/arena/chat-messages` | GET | Get chat messages for session |
| `/api/chat` | POST | Send chat message (uses global session) |

## Cron Jobs

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/snapshots` | Every 5 min | Save performance snapshots |
| `/api/cron/trading` | Every 1 min | Run autonomous trading loop |

## Message Metadata

Chat messages use metadata to track author and type:

```typescript
interface ChatMetadata {
  sessionId: string;
  authorType: "model" | "user" | "assistant";
  authorId: string;        // model_id, visitorIP, or 'assistant'
  messageType: "analysis" | "trade" | "commentary" | "user" | "assistant";
  relatedTradeId?: string;
  createdAt: number;
}
```
