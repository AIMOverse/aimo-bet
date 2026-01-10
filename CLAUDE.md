# Prediction Market Analysis Tools

AI-powered analysis tools using Parallel AI for prediction market research.

---

## Architecture Overview

```
lib/
├── config.ts                          # PARALLEL_API_KEY, PARALLEL_WEBHOOK_SECRET
├── parallel/
│   ├── client.ts                      # Parallel API client (search + task)
│   └── types.ts                       # Shared types
├── ai/tools/analysis/
│   ├── webSearch.ts                   # Quick web search (Search API)
│   ├── deepResearch.ts                # Comprehensive research (Task API)
│   ├── types.ts                       # Tool types
│   └── index.ts
├── supabase/
│   └── research.ts                    # Research result storage
└── ai/
    ├── agents/
    │   └── predictionMarketAgent.ts   # Main agent using tools
    └── workflows/
        └── tradingAgent.ts            # Durable workflow orchestrator

app/api/
├── parallel/
│   └── webhook/route.ts               # Receives Task API completion webhooks (Next.js)
└── agents/
    └── trigger/route.ts               # Existing agent trigger endpoint

party/
├── dflow-relay.ts                     # Kalshi real-time market data (WebSocket)
└── polymarket-relay.ts                # Polymarket real-time market data (WebSocket)
```

### Why Next.js for Webhooks (not PartyKit)

PartyKit is used for **persistent WebSocket connections** to upstream data sources (dflow, Polymarket).
Parallel Task API uses **HTTP webhooks** - a one-time POST when research completes. No persistent
connection needed, so Next.js API routes are simpler and sufficient.

---

## Tools Overview

| Tool | Purpose | API | Latency |
|------|---------|-----|---------|
| `webSearch` | Quick web search for news, sentiment, recent events | Search API | ~1-5s |
| `deepResearch` | Comprehensive research reports with citations | Task API | 10s-50min |

---

## Tool: webSearch

Fast web search using Parallel Search API. Optimized for quick lookups during agent execution.

### Factory

```typescript
function createWebSearchTool(): CoreTool
```

### Input

```typescript
{
  market_context: string       // What market is being analyzed (becomes objective)
  queries: string[]            // 1-5 specific search queries (max 200 chars each)
  max_results?: number         // 1-20, default: 10
  recency?: "day" | "week" | "month" | "any"  // Freshness preference, default: "week"
}
```

### Output

```typescript
{
  success: boolean
  search_id: string
  results: Array<{
    url: string
    title: string
    publish_date?: string
    excerpts: string[]         // LLM-optimized text excerpts
  }>
  result_count: number
  error?: string
}
```

### API Details

**Endpoint:** `POST https://api.parallel.ai/v1beta/search`

**Headers:**
```
Content-Type: application/json
x-api-key: $PARALLEL_API_KEY
parallel-beta: search-extract-2025-10-10
```

**Request Body:**
```typescript
{
  objective: string              // market_context + recency requirement
  search_queries: string[]       // queries array
  max_results: number
  excerpts: {
    max_chars_per_result: 10000
  },
  mode: "agentic"                // Always use agentic mode for token efficiency
}
```

### Implementation Notes

- Always use `mode: "agentic"` for token efficiency in multi-step agent workflows
- Include recency in objective text (e.g., "Find news from the past week about...")
- Objective provides context; queries ensure specific keywords are prioritized
- Keep individual queries under 200 characters
- Returns synchronously - suitable for inline agent tool calls

---

## Tool: deepResearch

Comprehensive research using Parallel Task API. Async execution with webhook notification.

### Factory

```typescript
function createDeepResearchTool(): CoreTool
```

### Input

```typescript
{
  research_question: string    // Natural language research task (max 15,000 chars)
  market_id?: string           // Optional market reference for context
  market_title?: string        // Optional market title for context
  processor?: Processor        // Processing tier, default: "pro-fast"
}
```

### Processor Tiers

| Processor | Latency | Use Case | Max Fields |
|-----------|---------|----------|------------|
| `lite` | 10s-60s | Basic metadata lookups | ~2 |
| `lite-fast` | 5s-30s | Faster basic lookups | ~2 |
| `base` | 15s-100s | Standard enrichments | ~5 |
| `base-fast` | 10s-50s | Faster standard | ~5 |
| `core` | 60s-5min | Cross-referenced research | ~10 |
| `core-fast` | 30s-2min | Faster cross-referenced | ~10 |
| `pro` | 2min-10min | Exploratory web research | ~20 |
| `pro-fast` | 1min-5min | Faster exploratory (default) | ~20 |
| `ultra` | 5min-25min | Deep multi-source research | ~20 |
| `ultra-fast` | 2min-10min | Faster deep research | ~20 |
| `ultra2x` | 5min-50min | Difficult deep research | ~25 |
| `ultra4x` | 5min-90min | Very difficult research | ~25 |
| `ultra8x` | 5min-2hr | Most difficult research | ~25 |

**Trade-off:** Standard processors optimize for freshness; fast processors optimize for speed.
Both maintain accuracy - the difference is data retrieval strategy when speed and currency compete.

### Output (Immediate)

```typescript
{
  success: boolean
  run_id: string               // Task run ID for tracking
  status: "pending"
  message: string              // "Research task submitted, results via webhook"
  error?: string
}
```

### Output (Webhook Delivery → Agent Trigger)

When task completes, Parallel POSTs to webhook, which triggers agent with full research content:

```typescript
// Trigger payload to /api/agents/trigger
{
  triggerType: "research_complete"
  research: {
    run_id: string
    status: "completed" | "failed"
    content: string            // Markdown report with inline citations
    basis: Array<{
      field: string
      citations: Array<{
        url: string
        excerpt: string
      }>
      confidence: number       // 0-1
      reasoning: string
    }>
    error?: string
  }
}
```

### API Details

**Create Task Endpoint:** `POST https://api.parallel.ai/v1/tasks/runs`

**Headers:**
```
Content-Type: application/json
x-api-key: $PARALLEL_API_KEY
```

**Request Body:**
```typescript
{
  input: string,               // research_question with market context
  processor: string,           // e.g., "pro-fast"
  webhook: {
    url: string,               // PARALLEL_WEBHOOK_URL
    events: ["completed", "failed"]
  },
  task_spec: {
    output_schema: {
      type: "text",
      description: "Comprehensive markdown research report..."
    }
  }
}
```

### Implementation Notes

- Task API is async - returns immediately with run_id
- Webhook receives results when task completes (10s - 2hr depending on processor)
- Default to markdown report format (richer context for agent reasoning)
- Processor is configurable per request based on urgency vs depth trade-off
- Keep input under 15,000 characters for optimal results
- TODO: Implement caching by market_id + question hash to reduce costs

---

## Webhook Architecture

### Flow

```
1. Agent calls deepResearch tool
2. Tool creates Task API run with webhook URL
3. Tool returns immediately with run_id, status: "pending"
4. Agent continues with other work or completes current run
5. Parallel completes research (10s - 2hr depending on processor)
6. Parallel POSTs results to /api/parallel/webhook
7. Webhook stores result in Supabase
8. Webhook triggers agent via /api/agents/trigger with full research content
9. Agent receives research in trigger payload and processes results
```

### Webhook Endpoint

**Path:** `POST /api/parallel/webhook`

**Authentication:** Verify `x-parallel-signature` header (HMAC-SHA256)

```typescript
// app/api/parallel/webhook/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { storeResearchResult } from "@/lib/supabase/research";
import type { WebhookPayload } from "@/lib/parallel/types";

const PARALLEL_WEBHOOK_SECRET = process.env.PARALLEL_WEBHOOK_SECRET!;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;
const VERCEL_URL = process.env.VERCEL_URL!;

export async function POST(req: NextRequest) {
  // 1. Verify signature
  const signature = req.headers.get("x-parallel-signature");
  const body = await req.text();
  
  const expectedSignature = createHmac("sha256", PARALLEL_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  
  if (signature !== expectedSignature) {
    console.error("[parallel/webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse payload
  const payload = JSON.parse(body) as WebhookPayload;
  console.log(`[parallel/webhook] Received: run_id=${payload.run_id}, status=${payload.status}`);

  // 3. Store result in Supabase (for audit/retrieval)
  await storeResearchResult(payload);

  // 4. Trigger agent with full research content in payload
  const triggerResponse = await fetch(`${VERCEL_URL}/api/agents/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${WEBHOOK_SECRET}`,
    },
    body: JSON.stringify({
      triggerType: "research_complete",
      research: payload,  // Full content included
    }),
  });

  if (!triggerResponse.ok) {
    console.error(`[parallel/webhook] Failed to trigger agent: ${triggerResponse.status}`);
  }

  return NextResponse.json({ received: true });
}
```

### Agent Trigger Update

Update `/api/agents/trigger` to handle research completion:

```typescript
// In app/api/agents/trigger/route.ts

export type TriggerType = "market" | "cron" | "manual" | "research_complete";

interface ResearchPayload {
  run_id: string;
  status: "completed" | "failed";
  content?: string;
  basis?: FieldBasis[];
  error?: string;
}

interface TriggerRequest {
  modelId?: string;
  signal?: MarketSignal;
  triggerType: TriggerType;
  filterByPosition?: boolean;
  research?: ResearchPayload;  // Present when triggerType === "research_complete"
}

// In POST handler, pass research to workflow input:
if (body.triggerType === "research_complete" && body.research) {
  const input: TradingInput = {
    modelId: model.id,
    walletAddress: model.walletAddress!,
    research: body.research,  // Agent receives full research content
  };
  // ... start workflow
}
```

### Agent Workflow Update

```typescript
// In lib/ai/workflows/tradingAgent.ts

export interface TradingInput {
  modelId: string;
  walletAddress: string;
  research?: ResearchPayload;  // Present when triggered by research completion
}

// In runAgentStep, pass research to agent context:
async function runAgentStep(input: TradingInput): Promise<TradingResult> {
  "use step";

  const agent = new PredictionMarketAgent({
    modelId: input.modelId,
    walletAddress: input.walletAddress,
    privateKey: getWalletPrivateKey(input.modelId),
    maxSteps: 10,
    researchContext: input.research,  // Include research if present
  });

  return await agent.run({});
}
```

---

## Supabase Storage

### Table: `research_results`

```sql
CREATE TABLE research_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  content TEXT,
  basis JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_research_results_run_id ON research_results(run_id);
CREATE INDEX idx_research_results_status ON research_results(status);
```

### Storage Functions

```typescript
// lib/supabase/research.ts

import { supabase } from "./client";
import type { WebhookPayload } from "@/lib/parallel/types";

export interface ResearchResult {
  id: string;
  run_id: string;
  status: "pending" | "completed" | "failed";
  content?: string;
  basis?: FieldBasis[];
  error?: string;
  created_at: string;
  completed_at?: string;
}

// Store result from webhook
export async function storeResearchResult(payload: WebhookPayload): Promise<void> {
  const { error } = await supabase
    .from("research_results")
    .upsert({
      run_id: payload.run_id,
      status: payload.status,
      content: payload.content,
      basis: payload.basis,
      error: payload.error,
      completed_at: new Date().toISOString(),
    }, {
      onConflict: "run_id",
    });

  if (error) {
    console.error("[supabase/research] Failed to store result:", error);
    throw error;
  }
}

// Create pending record when task is initiated
export async function createPendingResearch(runId: string): Promise<void> {
  const { error } = await supabase
    .from("research_results")
    .insert({
      run_id: runId,
      status: "pending",
    });

  if (error) {
    console.error("[supabase/research] Failed to create pending:", error);
    throw error;
  }
}

// Retrieve result by run_id (for polling fallback or audit)
export async function getResearchResult(runId: string): Promise<ResearchResult | null> {
  const { data, error } = await supabase
    .from("research_results")
    .select("*")
    .eq("run_id", runId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw error;
  }

  return data;
}
```

---

## Configuration

### `lib/config.ts`

```typescript
// Parallel AI
export const PARALLEL_API_KEY = process.env.PARALLEL_API_KEY;
export const PARALLEL_API_URL = "https://api.parallel.ai";
export const PARALLEL_WEBHOOK_SECRET = process.env.PARALLEL_WEBHOOK_SECRET;

// Webhook URL (for Task API callbacks)
export const PARALLEL_WEBHOOK_URL = process.env.VERCEL_URL
  ? `${process.env.VERCEL_URL}/api/parallel/webhook`
  : "http://localhost:3000/api/parallel/webhook";
```

### Environment Variables

```bash
# Parallel AI
PARALLEL_API_KEY=your_api_key
PARALLEL_WEBHOOK_SECRET=your_webhook_secret  # For verifying incoming webhooks

# Existing
VERCEL_URL=https://your-app.vercel.app
WEBHOOK_SECRET=your_internal_webhook_secret
```

---

## Parallel Client

### `lib/parallel/client.ts`

```typescript
import {
  PARALLEL_API_KEY,
  PARALLEL_API_URL,
  PARALLEL_WEBHOOK_URL,
} from "@/lib/config";
import type { SearchResult, TaskRunResponse, TaskStatus, Processor } from "./types";

/**
 * Search API - synchronous web search
 * Always uses agentic mode for token efficiency
 */
export async function search(params: {
  objective: string;
  queries: string[];
  maxResults?: number;
}): Promise<SearchResult> {
  const response = await fetch(`${PARALLEL_API_URL}/v1beta/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": PARALLEL_API_KEY!,
      "parallel-beta": "search-extract-2025-10-10",
    },
    body: JSON.stringify({
      objective: params.objective,
      search_queries: params.queries,
      max_results: params.maxResults ?? 10,
      excerpts: { max_chars_per_result: 10000 },
      mode: "agentic",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Search failed: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Task API - asynchronous research with webhook notification
 * Returns immediately with run_id; results delivered via webhook
 */
export async function createResearchTask(params: {
  input: string;
  processor?: Processor;
}): Promise<TaskRunResponse> {
  const response = await fetch(`${PARALLEL_API_URL}/v1/tasks/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": PARALLEL_API_KEY!,
    },
    body: JSON.stringify({
      input: params.input,
      processor: params.processor ?? "pro-fast",
      webhook: {
        url: PARALLEL_WEBHOOK_URL,
        events: ["completed", "failed"],
      },
      task_spec: {
        output_schema: {
          type: "text",
          description: `Comprehensive markdown research report with:
- Executive summary
- Key findings with inline citations
- Risk factors and uncertainties
- Data sources and confidence levels
- Recommendation if applicable`,
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Task creation failed: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Get task status - polling fallback if webhook fails
 */
export async function getTaskStatus(runId: string): Promise<TaskStatus> {
  const response = await fetch(`${PARALLEL_API_URL}/v1/tasks/runs/${runId}`, {
    headers: {
      "x-api-key": PARALLEL_API_KEY!,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Task status failed: ${response.status} - ${error}`);
  }

  return response.json();
}
```

---

## Types

### `lib/parallel/types.ts`

```typescript
export type Processor =
  | "lite" | "lite-fast"
  | "base" | "base-fast"
  | "core" | "core-fast" | "core2x"
  | "pro" | "pro-fast"
  | "ultra" | "ultra-fast" | "ultra2x" | "ultra4x" | "ultra8x";

export interface SearchResult {
  search_id: string;
  results: Array<{
    url: string;
    title: string;
    publish_date?: string;
    excerpts: string[];
  }>;
  warnings?: string[];
  usage?: {
    search_units: number;
  };
}

export interface TaskRunResponse {
  run_id: string;
}

export interface TaskStatus {
  run_id: string;
  status: "pending" | "running" | "completed" | "failed";
  content?: string;
  basis?: FieldBasis[];
  error?: string;
}

export interface FieldBasis {
  field: string;
  citations: Array<{
    url: string;
    excerpt: string;
  }>;
  confidence: number;
  reasoning: string;
}

export interface WebhookPayload {
  run_id: string;
  status: "completed" | "failed";
  content?: string;
  basis?: FieldBasis[];
  error?: string;
}
```

### `lib/ai/tools/analysis/types.ts`

```typescript
import type { Processor } from "@/lib/parallel/types";

export interface WebSearchInput {
  market_context: string;
  queries: string[];
  max_results?: number;
  recency?: "day" | "week" | "month" | "any";
}

export interface WebSearchOutput {
  success: boolean;
  search_id: string;
  results: Array<{
    url: string;
    title: string;
    publish_date?: string;
    excerpts: string[];
  }>;
  result_count: number;
  error?: string;
}

export interface DeepResearchInput {
  research_question: string;
  market_id?: string;
  market_title?: string;
  processor?: Processor;
}

export interface DeepResearchOutput {
  success: boolean;
  run_id: string;
  status: "pending";
  message: string;
  error?: string;
}
```

---

## Usage Examples

### webSearch in Agent

```typescript
// Agent decides to search for recent news
const searchResult = await webSearch.execute({
  market_context: "2024 US Presidential Election outcome prediction market",
  queries: [
    "latest 2024 election polls",
    "swing state polling Trump Biden",
    "election betting odds changes"
  ],
  max_results: 10,
  recency: "week"
});

// Agent uses excerpts for decision-making
for (const result of searchResult.results) {
  console.log(`Source: ${result.title} (${result.url})`);
  console.log(`Excerpts: ${result.excerpts.join("\n")}`);
}
```

### deepResearch in Agent

```typescript
// Agent initiates deep research (async)
const researchResult = await deepResearch.execute({
  research_question: `
    Analyze the likelihood of the Federal Reserve cutting interest rates 
    in Q1 2025. Consider:
    - Current inflation trends and Fed statements
    - Historical precedents for rate cuts
    - Market expectations and futures pricing
    - Economic indicators (employment, GDP, etc.)
  `,
  market_id: "fed-rate-cut-q1-2025",
  market_title: "Fed Rate Cut Q1 2025",
  processor: "pro-fast"
});

// Returns immediately - agent workflow ends
console.log(`Research submitted: ${researchResult.run_id}`);

// When Parallel completes (1-5 min later):
// 1. Webhook receives results
// 2. Stores in Supabase
// 3. Triggers agent with full research content
// 4. New agent run processes research and makes decisions
```

---

## Implementation Checklist

### Configuration
- [ ] Add to `lib/config.ts`:
  - [ ] `PARALLEL_API_KEY`
  - [ ] `PARALLEL_API_URL`
  - [ ] `PARALLEL_WEBHOOK_SECRET`
  - [ ] `PARALLEL_WEBHOOK_URL`

### Parallel Client
- [ ] Create `lib/parallel/types.ts`
- [ ] Create `lib/parallel/client.ts`
  - [ ] `search()` - Search API call with agentic mode
  - [ ] `createResearchTask()` - Task API call with webhook
  - [ ] `getTaskStatus()` - Polling fallback

### Supabase Storage
- [ ] Create `research_results` table (migration)
- [ ] Create `lib/supabase/research.ts`
  - [ ] `storeResearchResult()` - Store webhook payload
  - [ ] `createPendingResearch()` - Track initiated tasks
  - [ ] `getResearchResult()` - Retrieve by run_id

### Webhook Handler
- [ ] Create `app/api/parallel/webhook/route.ts`
  - [ ] HMAC signature verification
  - [ ] Store result in Supabase
  - [ ] Trigger agent with full research payload

### Agent Trigger Update
- [ ] Update `app/api/agents/trigger/route.ts`
  - [ ] Add `TriggerType = "research_complete"`
  - [ ] Add `research` field to `TriggerRequest`
  - [ ] Pass research to workflow input

### Analysis Tools
- [ ] Create `lib/ai/tools/analysis/types.ts`
- [ ] Create `lib/ai/tools/analysis/webSearch.ts`
  - [ ] Build objective from market_context + recency
  - [ ] Call `search()` client
  - [ ] Return formatted results
- [ ] Create `lib/ai/tools/analysis/deepResearch.ts`
  - [ ] Build input from research_question + market context
  - [ ] Call `createResearchTask()` with processor
  - [ ] Call `createPendingResearch()` to track
  - [ ] Return run_id and pending status
- [ ] Create `lib/ai/tools/analysis/index.ts`

### Agent Integration
- [ ] Update `TradingInput` interface with `research` field
- [ ] Update `PredictionMarketAgent` to accept `researchContext`
- [ ] Include research in agent system prompt when present
- [ ] Register `webSearch` and `deepResearch` tools
