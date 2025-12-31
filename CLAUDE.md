# AI Agent Refactor: Lean Context & Direct Tool Imports

Simplify the AI agent architecture by removing the tool factory pattern and adopting lean context prompts.

---

## Overview

### Current State (To Refactor)
```
lib/ai/
├── tools/
│   └── index.ts              # createAgentTools factory (remove)
├── agents/
│   └── predictionMarketAgent.ts  # Uses factory, complex context
├── prompts/trading/
│   └── contextBuilder.ts     # Complex context building (remove)
└── workflows/
    └── tradingAgent.ts       # Fetches markets via HTTP (simplify)
```

### Target State
```
lib/ai/
├── tools/
│   └── index.ts              # Simple exports only
├── agents/
│   └── predictionMarketAgent.ts  # Direct imports, lean prompt
├── prompts/trading/
│   └── systemPrompt.ts       # Keep system prompt
│   └── (contextBuilder.ts removed)
└── workflows/
    └── tradingAgent.ts       # Signal + balance only
```

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tool creation | Direct imports in agent | Clearer dependencies, simpler code |
| Context injection | Signer passed at agent level | Only signer needed for trading tools |
| Prompt strategy | Lean context (signal + balance) | Agent discovers via tools, fresher data |
| Market fetching | Agent uses discoverEvent | No stale pre-fetched data |

---

## Changes

### 1. `lib/ai/tools/index.ts` - Simplify to Exports Only

**Remove:** `createAgentTools` factory function, `getBalance`, `getTradeHistory`

**Keep:** Direct exports of tool creators

```typescript
// lib/ai/tools/index.ts

// Market Discovery
export { discoverEventTool } from "./discoverEvent";

// Position Management - creators that accept signer
export { createIncreasePositionTool } from "./increasePosition";
export { createDecreasePositionTool } from "./decreasePosition";
export { createRetrievePositionTool } from "./retrievePosition";
export { createRedeemPositionTool } from "./redeemPosition";

// Utilities
export {
  resolveMints,
  getTradeMintsForBuy,
  getTradeMintsForSell,
  getOutcomeMint,
  clearMarketCache,
} from "./utils/resolveMints";
```

---

### 2. `lib/ai/agents/predictionMarketAgent.ts` - Direct Imports

**Remove:** 
- Import of `createAgentTools`
- Complex `ContextPromptInput` building
- `buildContextPrompt` usage

**Add:**
- Direct tool imports
- Tool creation inline with signer
- Simple `buildTradingPrompt` function

```typescript
// Direct tool imports
import { discoverEventTool } from "@/lib/ai/tools/discoverEvent";
import { createIncreasePositionTool } from "@/lib/ai/tools/increasePosition";
import { createDecreasePositionTool } from "@/lib/ai/tools/decreasePosition";
import { createRetrievePositionTool } from "@/lib/ai/tools/retrievePosition";
import { createRedeemPositionTool } from "@/lib/ai/tools/redeemPosition";

// In run() method:
async run(input: TradingInput): Promise<TradingResult> {
  // Create signer
  const signer = this.config.privateKey 
    ? await createSignerFromBase58PrivateKey(this.config.privateKey)
    : undefined;

  // Create tools directly
  const tools = {
    discoverEvent: discoverEventTool,
    increasePosition: createIncreasePositionTool(this.config.walletAddress, signer),
    decreasePosition: createDecreasePositionTool(this.config.walletAddress, signer),
    retrievePosition: createRetrievePositionTool(this.config.walletAddress),
    redeemPosition: createRedeemPositionTool(this.config.walletAddress, signer),
  };

  // Build lean prompt
  const prompt = buildTradingPrompt({
    signal: input.signal,
    usdcBalance: input.usdcBalance,
  });

  // Run agent...
}
```

---

### 3. New Lean Prompt Builder

**File:** `lib/ai/prompts/trading/promptBuilder.ts` (new file, replaces contextBuilder.ts)

```typescript
export interface TradingPromptInput {
  signal?: {
    type: "price_swing" | "volume_spike" | "orderbook_imbalance";
    ticker: string;
    data: Record<string, unknown>;
    timestamp: number;
  };
  usdcBalance: number;
}

export function buildTradingPrompt(input: TradingPromptInput): string {
  const { signal, usdcBalance } = input;

  if (signal) {
    return buildSignalPrompt(signal, usdcBalance);
  }
  return buildPeriodicPrompt(usdcBalance);
}

function buildSignalPrompt(
  signal: TradingPromptInput["signal"],
  usdcBalance: number,
): string {
  const signalType = signal!.type.replace(/_/g, " ").toUpperCase();
  
  let signalDetails = "";
  switch (signal!.type) {
    case "price_swing":
      const { previousPrice, currentPrice, changePercent } = signal!.data as {
        previousPrice: number;
        currentPrice: number;
        changePercent: number;
      };
      signalDetails = `
- Previous price: ${previousPrice.toFixed(4)}
- Current price: ${currentPrice.toFixed(4)}  
- Change: ${(changePercent * 100).toFixed(2)}%`;
      break;
      
    case "volume_spike":
      const { volume, averageVolume, multiplier, takerSide } = signal!.data as {
        volume: number;
        averageVolume: number;
        multiplier: number;
        takerSide: string;
      };
      signalDetails = `
- Trade volume: ${volume}
- Average volume: ${averageVolume.toFixed(0)}
- Spike: ${multiplier.toFixed(1)}x normal
- Taker side: ${takerSide}`;
      break;
      
    case "orderbook_imbalance":
      const { ratio, direction } = signal!.data as {
        ratio: number;
        direction: string;
      };
      signalDetails = `
- Imbalance ratio: ${ratio.toFixed(2)}
- Direction: ${direction}`;
      break;
  }

  return `## Trading Signal Detected

**Type:** ${signalType}
**Market:** ${signal!.ticker}
**Time:** ${new Date(signal!.timestamp).toISOString()}
${signalDetails}

## Your Resources

Available USDC: $${usdcBalance.toFixed(2)}

## Instructions

1. Use \`discoverEvent\` to get current details for market "${signal!.ticker}"
2. Use \`retrievePosition\` to check if you have existing positions
3. Analyze whether this ${signalType.toLowerCase()} presents a trading opportunity
4. If confident (>70%), execute a trade using \`increasePosition\` or \`decreasePosition\`
5. Explain your reasoning clearly`;
}

function buildPeriodicPrompt(usdcBalance: number): string {
  return `## Periodic Market Scan

## Your Resources

Available USDC: $${usdcBalance.toFixed(2)}

## Instructions

1. Use \`discoverEvent\` to browse active prediction markets
2. Use \`retrievePosition\` to review your current positions
3. Look for mispriced markets or opportunities based on your analysis
4. If you find a high-conviction opportunity (>70%), execute a trade
5. If no compelling opportunities, explain why you're holding`;
}
```

---

### 4. `lib/ai/workflows/tradingAgent.ts` - Simplify Context Fetching

**Remove:** 
- `fetchContextStep` fetching markets via HTTP
- Complex `MarketContext` building

**Simplify to:**

```typescript
interface TradingInput {
  modelId: string;
  walletAddress: string;
  signal?: MarketSignal;  // From PartyKit relay
}

// Simplified context - just balance
async function fetchBalanceStep(walletAddress: string): Promise<number> {
  "use step";
  
  try {
    const res = await fetch(
      `${BASE_URL}/api/solana/balance?wallet=${walletAddress}`
    );
    if (res.ok) {
      const data = await res.json();
      return parseFloat(data.formatted) || 0;
    }
  } catch (error) {
    console.error("[tradingAgent] Failed to fetch balance:", error);
  }
  return 0;
}

// In workflow:
const usdcBalance = await fetchBalanceStep(input.walletAddress);

const result = await runAgentStep({
  ...input,
  usdcBalance,
});
```

---

### 5. Update Agent Input Type

```typescript
// lib/ai/agents/types.ts

export interface AgentConfig {
  modelId: string;
  walletAddress: string;
  privateKey?: string;
  maxSteps?: number;
}

export interface AgentRunInput {
  signal?: MarketSignal;
  usdcBalance: number;
}
```

---

## Files to Modify

| File | Action |
|------|--------|
| `lib/ai/tools/index.ts` | Remove `createAgentTools`, keep exports |
| `lib/ai/agents/predictionMarketAgent.ts` | Direct imports, lean prompt |
| `lib/ai/prompts/trading/promptBuilder.ts` | Create (new lean builder) |
| `lib/ai/prompts/trading/contextBuilder.ts` | Delete |
| `lib/ai/workflows/tradingAgent.ts` | Simplify to signal + balance |
| `lib/ai/agents/types.ts` | Simplify `AgentRunInput` |

---

## Implementation Checklist

- [ ] Create `lib/ai/prompts/trading/promptBuilder.ts`
- [ ] Update `lib/ai/agents/predictionMarketAgent.ts` with direct imports
- [ ] Simplify `lib/ai/tools/index.ts` (remove factory)
- [ ] Simplify `lib/ai/workflows/tradingAgent.ts` (balance only)
- [ ] Update `lib/ai/agents/types.ts`
- [ ] Delete `lib/ai/prompts/trading/contextBuilder.ts`
- [ ] Test signal-triggered agent runs
- [ ] Test periodic agent runs (no signal)
