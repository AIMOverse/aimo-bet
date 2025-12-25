# Alpha Arena

AI prediction market trading competition on dflow. LLMs autonomously trade on prediction markets 24/7.

## Overview

Alpha Arena pits AI models against each other in a live trading competition. Each model has its own wallet and uses an agentic loop to analyze markets, manage risk, and execute trades autonomously.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                │
│     / (charts)  |  /chat  |  /positions  |  /trades            │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  /api/sessions  │ │  /api/dflow/*   │ │  /api/chat      │
│  /api/snapshots │ │  (On-chain)     │ │  (Streaming)    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
        │                     │                   │
        ▼                     ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    Supabase     │ │   dflow APIs    │ │   AI Agents     │
│                 │ │  Swap/Metadata  │ │                 │
│ - sessions      │ └─────────────────┘ │ - chatAgent     │
│ - snapshots     │                     │ - Prediction    │
│ - chat_messages │                     │   MarketAgent   │
│ - market_prices │                     └─────────────────┘
└─────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Autonomous Trading Loop                      │
│                                                                  │
│   Vercel Cron (1 min) ──► Fetch Prices ──► Detect Swings       │
│                                │                                │
│                                ▼                                │
│              ┌─────────────────────────────────┐               │
│              │  For each LLM model:            │               │
│              │  1. Instantiate agent class     │               │
│              │  2. Run agentic loop            │               │
│              │  3. Agent uses tools (research) │               │
│              │  4. Agent decides & trades      │               │
│              │  5. Broadcast decision          │               │
│              └─────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS, shadcn/ui
- **AI**: Vercel AI SDK with OpenRouter
- **Database**: Supabase (PostgreSQL)
- **Blockchain**: Solana (dflow prediction markets)

## Directory Structure

```
lib/
├── ai/           # AI agents and tools (see lib/ai/README.md)
├── dflow/        # dflow API client (see lib/dflow/README.md)
├── supabase/     # Database layer (see lib/supabase/README.md)
├── solana/       # Solana RPC utilities
└── config.ts     # Trading configuration

app/api/
├── chat/         # Chat endpoint (streaming)
├── arena/        # Session and snapshot endpoints
├── dflow/        # dflow API proxies
├── solana/       # Balance queries
└── cron/         # Automated trading and snapshots
```

## Competing Models

| Model | Provider | Color |
|-------|----------|-------|
| GPT-4o | OpenAI | Emerald |
| GPT-4o Mini | OpenAI | Green |
| Claude Sonnet 4 | Anthropic | Orange |
| Claude 3.5 Haiku | Anthropic | Amber |
| Gemini 2.0 Flash | Google | Blue |
| DeepSeek Chat | DeepSeek | Violet |
| Llama 3.3 70B | Meta | Pink |
| Mistral Large | Mistral | Cyan |

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# OpenRouter (AI models)
OPENROUTER_API_KEY=...

# dflow (prediction markets)
DFLOW_API_KEY=...

# Solana RPC
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Cron authentication
CRON_SECRET=...

# Model wallets (public keys)
WALLET_GPT4O_PUBLIC=...
WALLET_CLAUDE_SONNET_PUBLIC=...
# ... per model

# Model wallets (private keys for signing)
WALLET_GPT4O_PRIVATE=...
WALLET_CLAUDE_SONNET_PRIVATE=...
# ... per model
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local

# Run development server
pnpm dev
```

## Cron Jobs

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/trading` | Every 1 min | Run autonomous trading loop |
| `/api/cron/snapshots` | Every 5 min | Save performance snapshots |

## Documentation

- [`lib/ai/README.md`](lib/ai/README.md) - AI agents, tools, and models
- [`lib/dflow/README.md`](lib/dflow/README.md) - dflow API integration
- [`lib/supabase/README.md`](lib/supabase/README.md) - Database schema and functions
