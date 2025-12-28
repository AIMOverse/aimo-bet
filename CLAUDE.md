# Alpha Arena

AI prediction market trading competition on dflow. LLMs autonomously trade on prediction markets 24/7.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend                                        │
│       / (charts)  |  /chat (feed)  |  /positions  |  /trades                │
│                                                                              │
│  useChat + WorkflowChatTransport  ←──  Resumable AI-SDK streams             │
│  useRealtimeMessages              ←──  Supabase Realtime (agent_decisions)  │
│  usePerformanceChart              ←──  Supabase Realtime (agent_decisions)  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
          ┌─────────────────┐             ┌─────────────────┐
          │   /api/chat     │             │  /api/dflow/*   │
          │   (Unified)     │             │  (On-chain)     │
          │                 │             │                 │
          │ POST: trigger   │             │                 │
          │ GET:  resume    │             │                 │
          │       history   │             │                 │
          └────────┬────────┘             └─────────────────┘
                   │                                │
                   ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Workflow DevKit                             │
│                                                                  │
│  tradingAgentWorkflow (DurableAgent)                            │
│  ├── Streams UIMessageChunk (AI-SDK compatible)                 │
│  ├── Tools execute as durable steps ("use step")                │
│  ├── Resumable via WorkflowChatTransport                        │
│  └── Observable in workflow dashboard                           │
└─────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                 │
│                                                                  │
│  trading_sessions ──► agent_sessions ──► agent_decisions        │
│                            │                   │                 │
│                            │                   ▼                 │
│                            │             agent_trades            │
│                            │                                     │
│                            └──► current_value (leaderboard)      │
│                                                                  │
│  Realtime Subscriptions:                                        │
│  - agent_decisions (INSERT) → Chat feed + Performance chart     │
│  - agent_trades (INSERT) → Trade details                        │
│  - agent_sessions (UPDATE) → Leaderboard                        │
└─────────────────────────────────────────────────────────────────┘
          ▲
          │
┌─────────────────────────────────────────────────────────────────┐
│                      PartyKit Relay                              │
│                   party/dflow-relay.ts                           │
│                                                                  │
│  dflow WebSocket ──► Signal Detection ──► /api/chat (POST)      │
│                      - Price swing                               │
│                      - Volume spike                              │
│                      - Orderbook imbalance                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### DurableAgent Workflow

The trading system uses a single `DurableAgent` workflow that:

1. **Streams AI-SDK format** - `UIMessageChunk` compatible with `useChat`
2. **Durable tool execution** - Tools marked with `"use step"` are retryable
3. **Resumable streams** - Clients can reconnect via `WorkflowChatTransport`
4. **Records decisions** - Writes to `agent_decisions` table (triggers Realtime)

### Unified `/api/chat` Endpoint

Single endpoint handles all chat-related operations:

| Method | Query Params | Purpose |
|--------|--------------|---------|
| `POST` | - | Trigger trading workflow (from signal) |
| `GET` | `runId` | Resume workflow stream |
| `GET` | `runId` + `startIndex` | Resume from specific position |
| `GET` | `sessionId` | Fetch historical messages |

### Data Flow

```
Signal (PartyKit) → POST /api/chat → tradingAgentWorkflow
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
              DurableAgent.stream()  recordAgentDecision()  Supabase Realtime
                    │                     │                     │
                    ▼                     ▼                     ▼
              UIMessageChunk         agent_decisions      useRealtimeMessages
              (live stream)          (persistence)        (chat feed update)
```

---

## Database Schema

### Design Principles

1. **On-chain as source of truth** - Blockchain authoritative for balances/positions
2. **Mirror to DB for analytics** - All decisions and trades persisted for history
3. **Decision-first architecture** - Every trigger creates a decision; trades are outcomes
4. **No separate history table** - Chart data from `agent_decisions.portfolio_value_after`
5. **Decisions ARE chat messages** - `agent_decisions` feeds the chat UI via transforms

### Entity Relationship Diagram

```
┌─────────────────────┐
│  trading_sessions   │
│  (arena/competition)│
├─────────────────────┤
│  id (PK)            │
│  name               │
│  status             │
│  starting_capital   │
│  started_at         │
│  ended_at           │
│  created_at         │
└─────────┬───────────┘
          │ 1:N
          ▼
┌─────────────────────────┐
│     agent_sessions      │
│    (model in arena)     │
├─────────────────────────┤
│  id (PK)                │
│  session_id (FK)        │
│  model_id               │
│  model_name             │
│  wallet_address         │
│  starting_capital       │
│  current_value          │  ◄── Leaderboard
│  total_pnl              │
│  status                 │
│  created_at             │
│  updated_at             │
└─────────┬───────────────┘
          │ 1:N
          ▼
┌─────────────────────────┐
│    agent_decisions      │
│    (every trigger)      │
├─────────────────────────┤
│  id (PK)                │
│  agent_session_id (FK)  │
│  trigger_type           │
│  trigger_details        │
│  market_ticker          │
│  market_title           │
│  decision               │
│  reasoning              │  ◄── Chat feed content
│  confidence             │
│  market_context         │
│  portfolio_value_after  │  ◄── Chart time-series
│  created_at             │
└─────────┬───────────────┘
          │ 1:N
          ▼
┌─────────────────────────┐
│      agent_trades       │
│    (executed trades)    │
├─────────────────────────┤
│  id (PK)                │
│  decision_id (FK)       │
│  agent_session_id (FK)  │
│  market_ticker          │
│  side (yes/no)          │
│  action (buy/sell)      │
│  quantity               │
│  price                  │
│  notional               │
│  tx_signature           │
│  pnl                    │
│  created_at             │
└─────────────────────────┘
```

### Tables Summary

| Table | Purpose | Realtime |
|-------|---------|----------|
| `trading_sessions` | Arena/competition container | No |
| `agent_sessions` | Agent state, leaderboard ranking | UPDATE |
| `agent_decisions` | Triggers + reasoning (chat + chart source) | INSERT |
| `agent_trades` | Executed trades linked to decisions | INSERT |

---

## Trading Agent Workflow

### File: `lib/ai/workflows/tradingAgent.ts`

Single DurableAgent workflow that replaces:
- `lib/ai/agents/chatAgent.ts` (deleted)
- `lib/ai/agents/predictionMarketAgent.ts` (deleted)

```typescript
"use workflow";

import { DurableAgent } from "@workflow/ai";
import { getWritable, sleep } from "workflow";
import type { UIMessageChunk } from "ai";

export async function tradingAgentWorkflow(input: TradingInput): Promise<TradingResult> {
  const writable = getWritable<UIMessageChunk>();

  // Step 1: Get/create sessions
  const session = await getSession();
  const agentSession = await getAgentSessionStep(...);

  // Step 2: Fetch market context
  const context = await fetchContext(input.walletAddress);

  // Step 3: Build context prompt
  const contextPrompt = buildContextPrompt({ ... });

  // Step 4: Create and run DurableAgent
  const agent = new DurableAgent({
    model: getModel(input.modelId),
    system: TRADING_SYSTEM_PROMPT,
    tools: createDurableTools(input.walletAddress, privateKey),
  });

  const result = await agent.stream({
    messages: [{ role: "user", content: contextPrompt }],
    writable,
    maxSteps: TRADING_CONFIG.maxStepsPerAgent,
  });

  // Step 5: Extract and record results
  const tradingResult = extractResultFromAgent(result, input, context);
  
  if (tradingResult.trades.length > 0) {
    await waitForFills(tradingResult.trades);
  }

  // Step 6: Record to database (triggers Supabase Realtime → chat feed)
  await recordDecisionAndTrades(agentSession, input, tradingResult);

  return tradingResult;
}
```

### Tool Definitions

Tools are defined inline with `"use step"` for durability:

```typescript
function createDurableTools(walletAddress: string, privateKey?: string) {
  return {
    getMarkets: {
      description: "Get list of prediction markets.",
      inputSchema: z.object({ ... }),
      execute: async function({ status, limit }) {
        "use step";  // Durable - retries on failure
        const res = await fetch(`${BASE_URL}/api/dflow/markets?...`);
        return { success: true, markets: await res.json() };
      },
    },

    placeOrder: {
      description: "Place a buy or sell order.",
      inputSchema: z.object({ ... }),
      execute: async function(args) {
        "use step";  // Durable - retries on failure
        const res = await fetch(`${BASE_URL}/api/dflow/order`, { ... });
        return { success: true, order: await res.json() };
      },
    },

    cancelOrder: {
      description: "Cancel a pending order.",
      inputSchema: z.object({ ... }),
      execute: async function({ order_id }) {
        // NO "use step" - don't retry cancellations
        const res = await fetch(`${BASE_URL}/api/dflow/order/${order_id}`, { method: "DELETE" });
        return { success: true, result: await res.json() };
      },
    },
  };
}
```

### Available Tools

| Tool | Durable | Purpose |
|------|---------|---------|
| `getMarkets` | Yes | List prediction markets |
| `getMarketDetails` | Yes | Get specific market info |
| `getLiveData` | Yes | Get live prices/orderbook |
| `getBalance` | Yes | Check wallet balance |
| `getPositions` | Yes | List current positions |
| `getTradeHistory` | Yes | Recent trade history |
| `placeOrder` | Yes | Execute buy/sell |
| `getOrderStatus` | Yes | Check order status |
| `cancelOrder` | No | Cancel pending order |

---

## API Endpoint

### File: `app/api/chat/route.ts`

```typescript
import { start, getRun } from "workflow/api";
import { tradingAgentWorkflow } from "@/lib/ai/workflows/tradingAgent";
import { decisionsToMessages } from "@/lib/supabase/transforms";

// POST - Start trading workflow
export async function POST(req: Request) {
  const input = await req.json();
  
  const run = await start(tradingAgentWorkflow, input);
  
  return new Response(await run.getReadable(), {
    headers: {
      "Content-Type": "text/event-stream",
      "x-workflow-run-id": run.id,
    },
  });
}

// GET - Resume stream or fetch history
export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const sessionId = url.searchParams.get("sessionId");

  if (runId) {
    // Resume workflow stream
    const run = await getRun(runId);
    if (!run) return new Response("Not found", { status: 404 });
    
    const startIndex = url.searchParams.get("startIndex");
    return new Response(
      await run.getReadable({ 
        startIndex: startIndex ? parseInt(startIndex) : undefined 
      }),
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  if (sessionId) {
    // Fetch historical messages from agent_decisions
    const messages = await fetchDecisionsAsMessages(sessionId);
    return NextResponse.json(messages);
  }

  return new Response("Missing runId or sessionId", { status: 400 });
}
```

---

## Frontend Integration

### WorkflowChatTransport

Use AI-SDK's `useChat` with workflow transport for resumable streams:

```typescript
import { useChat } from "ai/react";
import { WorkflowChatTransport } from "@workflow/ai";

function TradingFeed() {
  const { messages } = useChat({
    api: "/api/chat",
    transport: WorkflowChatTransport,
  });

  return <ModelChatFeed messages={messages} />;
}
```

### Supabase Realtime

Subscribe to `agent_decisions` for real-time updates:

```typescript
// hooks/chat/useRealtimeMessages.ts
export function useRealtimeMessages({ sessionId, onMessage }) {
  useEffect(() => {
    const channel = supabase
      .channel(`decisions:${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "agent_decisions",
      }, async (payload) => {
        const message = await fetchAndTransformDecision(payload.new.id);
        onMessage(message);
      })
      .subscribe();

    return () => channel.unsubscribe();
  }, [sessionId, onMessage]);
}
```

### Transform Layer

Convert `agent_decisions` to `ChatMessage` format:

```typescript
// lib/supabase/transforms.ts
export function decisionToChatMessage(
  decision: AgentDecision,
  agentSession: AgentSession,
  trades: AgentTrade[]
): ChatMessage {
  return {
    id: decision.id,
    role: "assistant",
    parts: [{ type: "text", text: formatDecisionContent(decision, trades) }],
    metadata: {
      sessionId: agentSession.sessionId,
      authorType: "model",
      authorId: agentSession.modelId,
      decision: decision.decision,
      confidence: decision.confidence,
      portfolioValue: decision.portfolioValueAfter,
    },
  };
}
```

---

## File Structure

### Core Files

```
lib/ai/
├── workflows/
│   └── tradingAgent.ts      # DurableAgent workflow (main entry point)
├── prompts/
│   └── trading/
│       ├── systemPrompt.ts  # Trading agent system prompt
│       └── contextBuilder.ts # Build context from market data
├── models/
│   ├── index.ts             # Model registry
│   └── catalog.ts           # Model configs + wallet mappings
└── guardrails/
    └── index.ts             # Trading middleware (limits, safety)

lib/supabase/
├── agents.ts                # recordAgentDecision, recordAgentTrade
├── transforms.ts            # decisionToChatMessage, decisionsToMessages
├── types.ts                 # AgentDecision, AgentTrade, etc.
└── db.ts                    # Core DB functions

app/api/
├── chat/
│   └── route.ts             # Unified endpoint (POST trigger, GET resume/history)
├── dflow/                   # On-chain operations
│   ├── markets/
│   ├── order/
│   └── positions/
└── signals/
    └── trigger/route.ts     # PartyKit signal receiver

hooks/
├── chat/
│   ├── useChat.ts           # Chat hook (uses WorkflowChatTransport)
│   └── useRealtimeMessages.ts # Supabase Realtime subscription
└── usePerformanceChart.ts   # Chart data from agent_decisions
```

### Deleted Files

| File | Reason |
|------|--------|
| `lib/ai/agents/chatAgent.ts` | Replaced by DurableAgent workflow |
| `lib/ai/agents/predictionMarketAgent.ts` | Merged into tradingAgent.ts |
| `app/api/chat/stream/route.ts` | Merged into /api/chat |
| `app/api/arena/chat-messages/route.ts` | Merged into /api/chat?sessionId= |

---

## Implementation Checklist

### Phase 1: Workflow Migration
- [ ] Install `@workflow/ai` package
- [ ] Refactor `tradingAgentWorkflow` to use `DurableAgent`
- [ ] Define tools with `"use step"` for durability
- [ ] Test streaming with `UIMessageChunk` format

### Phase 2: API Consolidation
- [ ] Update `/api/chat/route.ts` with unified handlers
- [ ] Add `x-workflow-run-id` header for resumability
- [ ] Implement `GET` handler for stream resume + history
- [ ] Delete `/api/chat/stream/route.ts`
- [ ] Delete `/api/arena/chat-messages/route.ts`

### Phase 3: Frontend Integration
- [ ] Install `WorkflowChatTransport` from `@workflow/ai`
- [ ] Update `useChat` to use workflow transport
- [ ] Verify `useRealtimeMessages` works with `agent_decisions`
- [ ] Test stream resumption on page refresh

### Phase 4: Agent Cleanup
- [ ] Delete `lib/ai/agents/chatAgent.ts`
- [ ] Delete `lib/ai/agents/predictionMarketAgent.ts`
- [ ] Update `lib/ai/agents/index.ts` exports
- [ ] Move shared types to `lib/ai/agents/types.ts` if needed

### Phase 5: Database
- [ ] Verify `agent_decisions` table exists with correct schema
- [ ] Enable Supabase Realtime on required tables
- [ ] Test `recordAgentDecision` and `recordAgentTrade` functions

---

## Key Dependencies

```json
{
  "dependencies": {
    "workflow": "^4.x",
    "@workflow/ai": "^4.x",
    "ai": "^4.x",
    "zod": "^3.x"
  }
}
```

---

## Environment Variables

```bash
# Workflow
WORKFLOW_API_KEY=your_workflow_key

# AI Models
OPENROUTER_API_KEY=your_openrouter_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# App
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```
