# Test DeepSeek V3.2 Trading Agent

Test the PredictionMarketAgent with DeepSeek V3.2 via OpenRouter using the test wallet.

---

## Overview

### Architecture

```
POST /api/chat
    ↓
tradingAgentWorkflow(input)
    ↓
1. getSessionStep()         → Global trading session
2. getAgentSessionStep()    → Agent session (uses getModelName, getWalletPrivateKey)
3. fetchBalanceStep()       → USDC balance from test wallet
4. runAgentStep()           → PredictionMarketAgent
    ↓
    Creates signer from private key
    Passes signer to trading tools
    ↓
5. waitForFillsStep()       → Wait for order fills
6. recordResultsStep()      → Record to database
```

### Key Design

- **Signer-based tools**: Trading tools receive `KeyPairSigner` (not raw private key)
- **Agent creates signer**: `createSignerFromBase58PrivateKey(privateKey)` → signer
- **Tools use signer**: `createIncreasePositionTool(walletAddress, signer)`

---

## Changes Required

### 1. Add DeepSeek V3.2 to Model Catalog

**File:** `lib/ai/models/catalog.ts`

Add to `MODELS` array:

```typescript
// DeepSeek V3.2 (Test)
{
  id: "openrouter/deepseek/deepseek-v3.2",
  name: "DeepSeek V3.2",
  provider: "openrouter",
  contextLength: 64000,
  pricing: { prompt: 0.14, completion: 0.28 },
  description: "DeepSeek V3.2 - Latest version for testing",
  supportsVision: false,
  supportsFunctions: true,
  series: "deepseek",
  chartColor: "#a78bfa",
  walletAddress: process.env.TEST_WALLET_PUBLIC_KEY,
  enabled: true,
},
```

Add to `WALLET_PRIVATE_KEY_MAP`:

```typescript
"openrouter/deepseek/deepseek-v3.2": process.env.TEST_WALLET_PRIVATE_KEY,
```

### 2. Environment Variables

**File:** `.env.local`

Ensure these are set:

```bash
TEST_WALLET_PUBLIC_KEY=<your-test-wallet-public-key>
TEST_WALLET_PRIVATE_KEY=<your-test-wallet-private-key-base58>
OPENROUTER_API_KEY=<your-openrouter-api-key>
```

---

## Test Trigger

### Via curl (Periodic Mode)

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "openrouter/deepseek/deepseek-v3.2",
    "walletAddress": "<TEST_WALLET_PUBLIC_KEY>"
  }'
```

### Via curl (With Signal)

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "openrouter/deepseek/deepseek-v3.2",
    "walletAddress": "<TEST_WALLET_PUBLIC_KEY>",
    "signal": {
      "type": "price_swing",
      "ticker": "BTC-50000-2024",
      "data": {
        "previousPrice": 0.45,
        "currentPrice": 0.52,
        "changePercent": 0.156
      },
      "timestamp": 1704067200000
    }
  }'
```

---

## Implementation Checklist

- [ ] Add DeepSeek V3.2 to `MODELS` array in `lib/ai/models/catalog.ts`
- [ ] Add private key mapping to `WALLET_PRIVATE_KEY_MAP` in `lib/ai/models/catalog.ts`
- [ ] Verify `.env.local` has `TEST_WALLET_PUBLIC_KEY` and `TEST_WALLET_PRIVATE_KEY`
- [ ] Verify `.env.local` has `OPENROUTER_API_KEY`
- [ ] Run `npm run dev` to start the server
- [ ] Trigger test via curl
- [ ] Monitor logs for agent execution
- [ ] Verify trade execution on-chain (if agent decides to trade)

---

## Expected Flow

1. **Agent starts** with lean context (USDC balance only)
2. **Agent discovers markets** via `discoverEvent` tool
3. **Agent checks positions** via `retrievePosition` tool
4. **Agent decides** whether to trade based on market analysis
5. **If confident (>70%)**, agent executes trade via `increasePosition` or `decreasePosition`
6. **Workflow records** decision and trades to database
7. **Response streams** back via SSE

---

## Debugging

### Check logs

```bash
# Terminal running dev server shows:
[tradingAgent:openrouter/deepseek/deepseek-v3.2] Starting trading workflow
[PredictionMarketAgent:openrouter/deepseek/deepseek-v3.2] Starting agent run
[PredictionMarketAgent:openrouter/deepseek/deepseek-v3.2] Completed with X steps
[tradingAgent:openrouter/deepseek/deepseek-v3.2] Completed: <decision>, X trades
```

### Common issues

| Issue | Solution |
|-------|----------|
| Model not found | Check model ID matches exactly in catalog |
| Signer undefined | Check `TEST_WALLET_PRIVATE_KEY` is set and valid base58 |
| Balance is 0 | Verify test wallet has USDC, check balance API |
| No trades executed | Agent may decide to hold - check reasoning in response |
