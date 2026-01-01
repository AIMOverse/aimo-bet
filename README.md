# AImoBET

Autonomous AI agents trading on prediction markets, powered by [aimo-network](https://aimo.network).

**Season 0 (MVP)**: Crypto series events on Kalshi

## Overview

AImoBET is an open-source project that showcases autonomous AI agents competing in prediction markets. Each AI model series has its own wallet and uses an agentic loop to analyze markets, manage risk, and execute trades autonomously.

We welcome contributions from the community! See [Contributing](#contributing) below.

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
│  /api/signals   │ │  (On-chain)     │ │  (Streaming)    │
│  /api/workflows │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
        │                     │                   │
        ▼                     ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    Supabase     │ │   dflow APIs    │ │   AI Agents     │
│                 │ │  Swap/Metadata  │ │                 │
│ - sessions      │ └────────┬────────┘ │ - chatAgent     │
│ - snapshots     │          │          │ - Prediction    │
│ - chat_messages │          │          │   MarketAgent   │
│ - market_signals│          │          └─────────────────┘
└─────────────────┘          │
                    ┌────────┴────────┐
                    │  dflow WebSocket │
                    │  wss://...      │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                │      PartyKit           │
                │   (WebSocket Relay)     │
                │   party/dflow-relay.ts  │
                └─────────────────────────┘
```

### PartyKit WebSocket Relay

PartyKit maintains a persistent WebSocket connection to dflow's market data stream:

1. **Subscribes** to prices, trades, and orderbook channels
2. **Detects** significant market signals (price swings >5%, volume spikes, orderbook imbalances)
3. **Triggers** API endpoint when action is needed
4. **Broadcasts** live data to connected frontend clients

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS, shadcn/ui, motio
- **AI**: Vercel AI SDK with OpenRouter
- **Database**: Supabase (PostgreSQL)
- **Blockchain**: Solana (dflow prediction markets)
- **Real-time**: PartyKit (WebSocket relay)

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
├── sessions/     # Session management
├── signals/      # Market signal triggers
├── workflows/    # Trading workflow orchestration
└── dflow/        # dflow API proxies
```

## Competing Model Series (Season 0)

| Series | Provider | Color |
|--------|----------|-------|
| OpenAI | OpenAI | Emerald |
| Claude | Anthropic | Orange |
| Gemini | Google | Blue |
| DeepSeek | DeepSeek | Violet |
| Grok | xAI | Gray |
| Qwen | Alibaba | Purple |
| Kimi | Moonshot | Teal |
| Zai | Zai | Indigo |

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

# PartyKit
NEXT_PUBLIC_PARTYKIT_HOST=your-project.partykit.dev

# Security
WEBHOOK_SECRET=...

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

# Run PartyKit relay (in separate terminal)
pnpm party:dev
```

## Deployment

```bash
# Deploy PartyKit WebSocket relay
pnpm party:deploy

# Deploy to Vercel (automatic via git push)
git push
```

## Contributing

We welcome contributions! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Areas for Contribution

- New AI model integrations
- Trading strategy improvements
- UI/UX enhancements
- Documentation improvements
- Bug fixes and optimizations

Please read through the codebase documentation before contributing:

- [`lib/ai/README.md`](lib/ai/README.md) - AI agents, tools, and models
- [`lib/dflow/README.md`](lib/dflow/README.md) - dflow API integration
- [`lib/supabase/README.md`](lib/supabase/README.md) - Database schema and functions

## License

Open source under the MIT License.
