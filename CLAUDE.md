# CLAUDE.md

 

This file provides guidance to Claude Code when working with code in this repository.

 

## Project Overview

 

**aimo-chat** is an open-source chat UI for interacting with LLMs. It's designed for developers with basic AI knowledge who want a ready-to-use chat interface with their own API keys (BYOK - Bring Your Own Key).

 

### Target Audience

 

- Developers who want a local chat UI without vendor lock-in

- Teams needing a self-hosted chat solution

- Anyone who wants to use OpenRouter, OpenAI, Anthropic, or compatible APIs

 

### Key Principles

 

1. **Zero account required** - No sign-up, no auth, just add your API key and start chatting

2. **BYOK (Bring Your Own Key)** - Works with any OpenAI-compatible API

3. **Local-first** - Sessions stored in localStorage, no external dependencies

4. **Minimal configuration** - Works out of the box with sensible defaults

5. **Customizable** - Easy to theme and extend

 

## Tech Stack

 

- **Framework**: Next.js 15 (App Router)

- **UI**: React 19 + shadcn/ui (new-york style) + Tailwind CSS 4

- **AI Integration**: Vercel AI SDK (`ai` package)

- **State Management**: Zustand (minimal, UI-only state)

- **Storage**: localStorage (V1), IndexedDB (future)

- **Forms**: react-hook-form + zod

 

## Commands

 

```bash

pnpm install    # Install dependencies

pnpm dev        # Start development server (http://localhost:3000)

pnpm build      # Build for production

pnpm start      # Start production server

pnpm lint       # Run ESLint

```

 

## Project Structure

 

```

aimo-chat/

├── src/

│   ├── app/

│   │   ├── page.tsx                 # Main chat interface

│   │   ├── layout.tsx               # Root layout with providers

│   │   └── api/

│   │       └── chat/

│   │           └── route.ts         # Chat API proxy

│   ├── components/

│   │   ├── ui/                      # shadcn/ui primitives

│   │   ├── chat/

│   │   │   ├── ChatInterface.tsx    # Main chat container

│   │   │   ├── ChatSidebar.tsx      # Session history sidebar

│   │   │   ├── ModelSelector.tsx    # Model selection dropdown

│   │   │   └── SettingsDialog.tsx   # API key + settings

│   │   └── ai-elements/

│   │       ├── message.tsx          # Message bubble component

│   │       ├── prompt-input.tsx     # Chat input with attachments

│   │       ├── code-block.tsx       # Syntax-highlighted code

│   │       ├── markdown.tsx         # Markdown renderer

│   │       └── ...                  # Other message renderers

│   ├── config/

│   │   ├── models.ts                # Default model definitions

│   │   ├── providers.ts             # API provider configurations

│   │   └── defaults.ts              # Default settings

│   ├── hooks/

│   │   ├── useChat.ts               # Chat logic hook

│   │   ├── useSessions.ts           # Session management

│   │   ├── useModels.ts             # Model fetching/selection

│   │   └── useSettings.ts           # Settings management

│   ├── lib/

│   │   ├── storage/

│   │   │   ├── sessions.ts          # Session CRUD (localStorage)

│   │   │   └── settings.ts          # Settings persistence

│   │   └── providers/

│   │       ├── openrouter.ts        # OpenRouter provider

│   │       ├── openai.ts            # OpenAI provider

│   │       └── base.ts              # Base provider interface

│   ├── store/

│   │   ├── chatStore.ts             # Chat UI state

│   │   ├── sessionStore.ts          # Current session state

│   │   └── settingsStore.ts         # User settings (API key, model)

│   ├── types/

│   │   ├── chat.ts                  # Message, Session types

│   │   ├── models.ts                # Model definitions

│   │   └── providers.ts             # Provider types

│   └── utils/

│       └── cn.ts                    # Tailwind class merger

├── public/

├── .env.example                     # Environment template

├── .env.local                       # Local environment (git-ignored)

├── tailwind.config.ts

├── next.config.ts

└── package.json

```

 

## Configuration

 

### Environment Variables

 

```bash

# .env.local

 

# API Provider (required - choose one)

OPENROUTER_API_KEY=sk-or-v1-...

# OR

OPENAI_API_KEY=sk-...

# OR

ANTHROPIC_API_KEY=sk-ant-...

 

# Optional: Custom API base URL (for self-hosted or proxies)

# API_BASE_URL=https://your-proxy.com/v1

 

# Optional: Default model (overrides config/defaults.ts)

# DEFAULT_MODEL=anthropic/claude-3.5-sonnet

```

 

### Model Configuration

 

Models can be configured in two ways:

 

**1. Via API (Dynamic Discovery)**

 

If the provider supports `/models` endpoint (OpenRouter, OpenAI), models are fetched automatically.

 

**2. Via Config File (Static)**

 

Define models in `src/config/models.ts`:

 

```typescript

export const MODELS: ModelDefinition[] = [

  {

    id: "anthropic/claude-3.5-sonnet",

    name: "Claude 3.5 Sonnet",

    provider: "anthropic",

    contextLength: 200000,

    pricing: { prompt: 3, completion: 15 }, // per 1M tokens

  },

  {

    id: "openai/gpt-4o",

    name: "GPT-4o",

    provider: "openai",

    contextLength: 128000,

    pricing: { prompt: 5, completion: 15 },

  },

  // Add custom models...

];

```

 

### Provider Configuration

 

Configure API providers in `src/config/providers.ts`:

 

```typescript

export const PROVIDERS: ProviderConfig[] = [

  {

    id: "openrouter",

    name: "OpenRouter",

    baseUrl: "https://openrouter.ai/api/v1",

    modelsEndpoint: "/models",  // Supports dynamic model discovery

    envKey: "OPENROUTER_API_KEY",

  },

  {

    id: "openai",

    name: "OpenAI",

    baseUrl: "https://api.openai.com/v1",

    modelsEndpoint: "/models",

    envKey: "OPENAI_API_KEY",

  },

  {

    id: "custom",

    name: "Custom Provider",

    baseUrl: process.env.API_BASE_URL,

    envKey: "API_KEY",

  },

];

```

 

## Architecture Decisions

 

### No Authentication (V1)

 

The app has no user accounts or authentication. This is intentional:

- Simpler setup (just add API key and go)

- No backend dependencies

- Privacy-friendly (all data stays local)

 

Future versions may add optional auth adapters for cross-device sync.

 

### localStorage for Sessions

 

Chat sessions are stored in browser localStorage:

- Zero setup required

- Works offline

- Data stays on user's machine

 

Limitations:

- ~5MB storage limit

- No cross-device sync

- Lost if browser data cleared

 

Future versions may add IndexedDB for larger storage and optional cloud sync.

 

### API Proxy Pattern

 

Chat requests go through `/api/chat` route instead of calling providers directly:

- Keeps API keys server-side (more secure)

- Enables rate limiting and logging

- Allows adding middleware (e.g., content filtering)

 

```

Browser → /api/chat → OpenRouter/OpenAI → Response

```

 

### Vercel AI SDK

 

We use the `ai` package for streaming chat:

- Built-in streaming support

- Provider-agnostic (works with OpenAI, Anthropic, etc.)

- React hooks for easy integration

 

## Code Style

 

- Use `@/` path alias for imports

- Use `@/utils/cn` for className merging (not `@/lib/utils`)

- Functional components with TypeScript

- Follow existing patterns in `@/components/ui`

- Prefer composition over inheritance

- Keep components focused and single-purpose

 

### Component Patterns

 

```typescript

// Preferred: Named exports, memo for expensive components

export const ChatMessage = memo(function ChatMessage({

  message,

  isLast,

}: ChatMessageProps) {

  // ...

});

 

// Props interface above or alongside component

interface ChatMessageProps {

  message: Message;

  isLast?: boolean;

}

```

 

### Store Patterns

 

```typescript

// Zustand store with persist middleware

export const useSettingsStore = create<SettingsState>()(

  persist(

    (set, get) => ({

      apiKey: "",

      modelId: DEFAULT_MODEL,

      setApiKey: (key) => set({ apiKey: key }),

      setModelId: (id) => set({ modelId: id }),

    }),

    { name: "aimo-chat-settings" }

  )

);

```

 

## What's NOT in V1 (Deferred)

 

The following features are intentionally deferred for future versions:

 

| Feature | Reason | Future Plan |

|---------|--------|-------------|

| MCP/Tools | Complexity | V2 - Add MCP server config |

| Marketplace | AIMO-specific | Maybe never (keep minimal) |

| User accounts | Simplicity | V2 - Optional auth adapters |

| Cloud sync | Requires backend | V2 - Optional Supabase/custom |

| File attachments | Complexity | V2 - With storage solution |

| Multi-modal (images) | Provider-dependent | V2 |

 

## Migration from aimo-web-app

 

This repo is extracted from [aimo-web-app](https://github.com/AIMOverse/aimo-web-app). Key changes:

 

| aimo-web-app | aimo-chat |

|--------------|-----------|

| AIMO wallet auth | No auth |

| AIMO backend APIs | Direct provider APIs |

| Supabase storage | localStorage |

| Full marketplace | Removed |

| MCP tools | Deferred |

| Complex account system | Simple settings |

 

### Files Migrated

 

From `aimo-web-app`, the following are adapted:

 

- `src/components/chat/*` → Simplified, no auth dependencies

- `src/components/ai-elements/*` → Mostly unchanged

- `src/components/ui/*` → Unchanged (shadcn)

- `src/hooks/chat/useChatMessage.ts` → Simplified

- `src/app/api/chat/route.ts` → Rewritten for direct provider calls

 

### Files NOT Migrated

 

- All wallet/auth code

- Marketplace components

- Account management

- AIMO-specific analytics

- Referral system

- Landing page

 

## Contributing

 

### Adding a New Provider

 

1. Create provider config in `src/config/providers.ts`

2. If special handling needed, add adapter in `src/lib/providers/`

3. Update types in `src/types/providers.ts`

4. Test with the provider's API

 

### Adding UI Components

 

We use shadcn/ui. To add a new component:

 

```bash

pnpm dlx shadcn@latest add [component-name]

```

 

Components are added to `src/components/ui/`.

 

## Deployment

 

### Vercel (Recommended)

 

1. Push to GitHub

2. Import in Vercel

3. Add environment variables

4. Deploy

 

### Docker

 

```dockerfile

FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]

```

 

### Self-Hosted

 

```bash

git clone https://github.com/AIMOverse/aimo-chat

cd aimo-chat

cp .env.example .env.local

# Edit .env.local with your API key

pnpm install

pnpm build

pnpm start

```

 

## Roadmap

 

### V1 (Current)

- [x] Basic chat interface

- [x] Model selection

- [x] Session management (localStorage)

- [x] BYOK (OpenRouter, OpenAI, Anthropic)

- [x] Markdown rendering

- [x] Code syntax highlighting

- [x] Dark/light theme

 

### V2 (Planned)

- [ ] MCP tool support

- [ ] File attachments

- [ ] IndexedDB storage (larger sessions)

- [ ] Optional auth adapters

- [ ] Export/import sessions

 

### V3 (Future)

- [ ] Multi-modal (images, vision)

- [ ] Optional cloud sync

- [ ] Plugin system
