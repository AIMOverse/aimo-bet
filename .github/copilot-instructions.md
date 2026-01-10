# AImoBET - Copilot Instructions

Autonomous AI agents trading on prediction markets (Kalshi, Polymarket) using [aimo-network](https://aimo.network).

## Architecture Overview

```
Frontend (Next.js 16)  →  Supabase (state)  ←  AI Agents (8 models)
                                ↑
PartyKit (WebSocket relay)  →  dflow/Polymarket (real-time market data)
```

**Core data flow**: PartyKit relays detect market signals → trigger agents via `/api/agents/trigger` → agents execute trades → results recorded to Supabase → UI updates via Realtime.

### Key Directories

- `lib/ai/` - Agent implementation, tools, models, prompts, workflows
- `lib/supabase/` - Database operations (single writer pattern)
- `party/` - PartyKit WebSocket relays to upstream exchanges
- `app/api/agents/` - Agent trigger, status, cron endpoints
- `hooks/` - React hooks using Supabase Realtime for UI updates

## Critical Patterns

### 1. Durable Workflow + Non-Durable Agent

The trading system uses a **durable workflow wrapper** around a **non-durable agent**:

```typescript
// lib/ai/workflows/tradingAgent.ts
async function tradingAgentWorkflow(input) {
  const session = await getSessionStep(); // Durable
  const agentSession = await getAgentSessionStep(); // Durable
  const result = await runAgentStep(input); // Agent inside is NOT durable
  await recordResultsStep(agentSession, result); // Durable
}
```

**Why**: Trade tools fire once without retry to prevent duplicate orders. If agent fails mid-execution, the entire step restarts.

### 2. KV Cache Optimization (Static Prompts)

```typescript
// ✅ CORRECT: Static prompt, agent fetches balance via tool
const agent = new ToolLoopAgent({
  instructions: TRADING_SYSTEM_PROMPT, // Static, cacheable
  tools: { getBalance, ... }
});
await agent.generate({ prompt: "Analyze markets..." });

// ❌ WRONG: Dynamic prompt with balance invalidates cache
const prompt = `Your balance is ${balance}...`; // Don't do this
```

**Why**: Static system prompts enable LLM KV cache hits across runs, reducing cost and latency.

### 3. Data Source Separation

| Source               | Used By                                           | Purpose                              |
| -------------------- | ------------------------------------------------- | ------------------------------------ |
| dflow/Polymarket API | Agent tools                                       | On-chain truth for trading decisions |
| Supabase             | UI hooks (`useChat`, `useTrades`, `usePositions`) | Display + Realtime updates           |
| RPC                  | `getBalance` tool                                 | Available trading capital            |

**Never** pass Supabase data to agents for trading decisions—use exchange APIs for accuracy.

### 4. Tool Creation Pattern

Tools requiring wallet context use factory functions:

```typescript
// Tools WITH signer context
const tools = {
  placeOrder: createPlaceOrderTool(
    walletAddress,
    kalshiSigner,
    polymarketWallet
  ),
  getBalance: createGetBalanceTool(signers),
  // Tools WITHOUT signer (stateless)
  discoverMarkets: discoverMarketsTool,
  webSearch: webSearchTool,
};
```

### 5. PartyKit for WebSocket, Next.js for Webhooks

- **PartyKit** (`party/`): Persistent WebSocket connections to upstream data (dflow, Polymarket)
- **Next.js API routes** (`app/api/`): HTTP webhooks (Parallel research completion) - no persistent connection needed

## Development Commands

```bash
pnpm dev           # Next.js dev server
pnpm party:dev     # PartyKit WebSocket relay (separate terminal)
pnpm party:deploy  # Deploy PartyKit to production

# Database
supabase db reset  # Reset local database with migrations + seed
```

## Environment Variables

Essential variables (see `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` - Database
- `AIMO_NETWORK_API_KEY` - AI model access
- `DFLOW_API_KEY` - Kalshi prediction markets
- `PARALLEL_API_KEY`, `PARALLEL_WEBHOOK_SECRET` - Research API
- `WEBHOOK_SECRET` - Internal endpoint auth (agent triggers)

## Supabase Schema

Core tables: `trading_sessions` → `agent_sessions` → `agent_decisions` + `agent_trades` + `agent_positions`

Migrations in `supabase/migrations/`. The workflow is the **single writer** for all agent data—UI hooks only read.

## Adding New Tools

1. Create tool in `lib/ai/tools/` following existing patterns
2. Export from `lib/ai/tools/index.ts`
3. Add to agent's tools object in `predictionMarketAgent.ts`
4. Update system prompt in `lib/ai/prompts/systemPrompt.ts` if agent needs guidance

## Adding New Exchanges

1. Create client in `lib/prediction-market/<exchange>/`
2. Add PartyKit relay in `party/<exchange>-relay.ts` for real-time data
3. Update agent tools to support new exchange's API
4. Add wallet/signer support in `lib/crypto/`

## Testing Agent Triggers

```bash
# Manual trigger (requires WEBHOOK_SECRET)
curl -X POST http://localhost:3000/api/agents/trigger \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"triggerType": "manual", "modelId": "anthropic/claude-sonnet-4.5"}'
```

## File References

- [tradingAgent.ts](../lib/ai/workflows/tradingAgent.ts) - Main workflow orchestrator
- [predictionMarketAgent.ts](../lib/ai/agents/predictionMarketAgent.ts) - Agent implementation
- [systemPrompt.ts](../lib/ai/prompts/systemPrompt.ts) - Agent instructions
- [dflow-relay.ts](../party/dflow-relay.ts) - Market signal detection
- [trigger/route.ts](../app/api/agents/trigger/route.ts) - Agent trigger endpoint
