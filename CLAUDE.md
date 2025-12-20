# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**aimo-chat** is an open-source, privacy-first chat UI for interacting with LLMs. Designed for users who want uncensored, private AI conversations without accounts or data collection.

### Core Value Proposition

**"Your keys. Your chat. No surveillance."**

### Key Principles

1. **Zero accounts** - No sign-up, no auth, no tracking
2. **BYOK (Bring Your Own Key)** - Works with any OpenAI-compatible API
3. **Privacy-first** - All data stays local (localStorage + optional Supabase you control)
4. **Uncensored** - No content filtering, no guardrails imposed by the app
5. **Simple** - Minimal UI, zero configuration required to start

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19 + shadcn/ui (new-york style) + Tailwind CSS 4
- **AI Integration**: Vercel AI SDK (`ai` package v6, `@ai-sdk/openai`)
- **State Management**: Zustand (minimal, UI-only state)
- **Storage**: localStorage (primary), optional Supabase (user-controlled)

## Commands

```bash
pnpm install    # Install dependencies
pnpm dev        # Start development server (http://localhost:3000)
pnpm build      # Build for production
pnpm start      # Start production server
pnpm lint       # Run ESLint
```

---

## Project Structure

```
aimo-chat/
├── app/
│   ├── page.tsx                 # Redirects to /chat
│   ├── layout.tsx               # Root layout with sidebar
│   ├── chat/
│   │   ├── page.tsx             # New chat (no session)
│   │   └── [id]/page.tsx        # Existing chat session
│   ├── generate/
│   │   ├── page.tsx             # New generation (placeholder)
│   │   └── [id]/page.tsx        # Existing generation session
│   └── api/
│       └── chat/route.ts        # Chat API
├── components/
│   ├── ui/                      # shadcn/ui primitives
│   ├── layout/                  # AppSidebar, AppHeader, ThemeProvider
│   ├── chat/                    # ChatInterface, ChatSidebar, etc.
│   └── generate/                # Generate mode components
├── lib/
│   └── ai/                      # AI integration layer
│       ├── middleware/          # Language model middleware
│       │   ├── logging.ts       # Request/response logging
│       │   ├── cache.ts         # Response caching
│       │   └── index.ts         # Middleware exports
│       ├── providers/           # Custom provider configurations
│       │   ├── aimo.ts          # AiMo Network provider
│       │   └── index.ts         # Provider exports
│       └── registry.ts          # Unified provider registry
├── config/
│   ├── models.ts                # Model definitions
│   ├── providers.ts             # Provider configurations
│   └── defaults.ts              # Default settings
├── hooks/
│   └── chat/                    # Chat-related hooks
├── store/                       # Zustand stores
└── types/                       # TypeScript types
```

---

## AI Architecture: Provider Registry & Middleware

The AI integration uses Vercel AI SDK's provider management and middleware system for a clean, extensible architecture.

### Architecture Overview

```
                    ┌─────────────────────────────────────┐
                    │         Provider Registry           │
                    │   (Unified access via string IDs)   │
                    └─────────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
    ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
    │ Custom Provider│      │ Custom Provider│      │   Fallback    │
    │     (aimo)     │      │  (openrouter)  │      │   Provider    │
    └───────────────┘      └───────────────┘      └───────────────┘
            │                       │
            ▼                       ▼
    ┌─────────────────────────────────────┐
    │           Middleware Stack          │
    │  (logging → cache → defaultSettings)│
    └─────────────────────────────────────┘
                    │
                    ▼
            ┌───────────────┐
            │   LLM API     │
            └───────────────┘
```

### Provider Registry (`lib/ai/registry.ts`)

Centralized model access through simple string IDs:

```typescript
import { createProviderRegistry } from 'ai';
import { aimo } from './providers/aimo';

export const registry = createProviderRegistry(
  {
    aimo,
    // openrouter, // Future providers
  },
  { separator: '/' },
);

// Usage: registry.languageModel('aimo/fast')
export function getModel(modelId: string) {
  return registry.languageModel(modelId);
}
```

### Custom Provider (`lib/ai/providers/aimo.ts`)

Pre-configured models with middleware and aliases:

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { customProvider, wrapLanguageModel, defaultSettingsMiddleware } from 'ai';
import { loggingMiddleware } from '../middleware/logging';

const aimoBase = createOpenAI({
  baseURL: 'https://devnet.aimo.network/api/v1',
  apiKey: process.env.OPENAI_API_KEY,
});

export const aimo = customProvider({
  languageModels: {
    // Default model with logging
    'gpt-oss-120b': wrapLanguageModel({
      model: aimoBase.chat('model-id'),
      middleware: [loggingMiddleware],
    }),

    // Alias: fast responses
    fast: wrapLanguageModel({
      model: aimoBase.chat('model-id'),
      middleware: [
        loggingMiddleware,
        defaultSettingsMiddleware({
          settings: { temperature: 0.7, maxOutputTokens: 1000 },
        }),
      ],
    }),

    // Alias: creative writing
    creative: wrapLanguageModel({
      model: aimoBase.chat('model-id'),
      middleware: [
        loggingMiddleware,
        defaultSettingsMiddleware({
          settings: { temperature: 1.0 },
        }),
      ],
    }),
  },
  fallbackProvider: aimoBase,
});
```

### Middleware (`lib/ai/middleware/`)

Intercept and modify LLM calls for cross-cutting concerns:

```typescript
// lib/ai/middleware/logging.ts
import type { LanguageModelV3Middleware } from '@ai-sdk/provider';

export const loggingMiddleware: LanguageModelV3Middleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    const start = Date.now();
    console.log('[AI] Generate started');

    const result = await doGenerate();

    console.log(`[AI] Completed in ${Date.now() - start}ms`);
    return result;
  },

  wrapStream: async ({ doStream, params }) => {
    console.log('[AI] Stream started');
    return doStream();
  },
};
```

### Available Middleware Types

| Middleware | Purpose | Use Case |
|------------|---------|----------|
| `loggingMiddleware` | Log requests/responses | Debugging, monitoring |
| `cacheMiddleware` | Cache identical queries | Reduce API costs |
| `defaultSettingsMiddleware` | Apply default settings | Consistent model behavior |
| `extractReasoningMiddleware` | Extract `<think>` tags | Reasoning models (DeepSeek R1) |
| `guardrailsMiddleware` | Filter sensitive content | PII protection |

### Usage in API Routes

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { getModel } from '@/lib/ai/registry';

const result = streamText({
  model: getModel('aimo/fast'), // Uses registry with middleware
  system: DEFAULT_SYSTEM_PROMPT,
  messages: simpleMessages,
});
```

### Request Flow

```
User selects "aimo/fast"
        │
        ▼
┌─────────────────┐
│ Provider Registry│ → Parses provider/model ID
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Custom Provider │ → Finds pre-configured "fast" model
│     (aimo)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Middleware    │ → 1. loggingMiddleware (logs request)
│     Stack       │ → 2. defaultSettingsMiddleware (applies temp=0.7)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AiMo Network   │ → Actual API call
└─────────────────┘
```

---

## Code Style

- Use `@/` path alias for imports
- Use `@/lib/utils` for className merging (`cn` function)
- Functional components with TypeScript
- Named exports with clear prop types
- Keep components focused and single-purpose

### Component Pattern

```typescript
export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  // ...
}
```

### Store Pattern

```typescript
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      setApiKey: (key) => set({ apiKey: key }),
    }),
    { name: 'aimo-chat-settings' }
  )
);
```

---

## Roadmap

### V1 - Core Chat (COMPLETE)
- [x] Basic chat interface
- [x] Model selection
- [x] Session management
- [x] Markdown rendering
- [x] Dark/light theme

### V2 - Extensibility (COMPLETE)
- [x] Agent/tool selection
- [x] MCP tool support

### V3 - AI Architecture (CURRENT)
- [ ] Provider Registry implementation
- [ ] Custom Provider with model aliases
- [ ] Middleware stack (logging, cache, defaults)
- [ ] Chat/Generate mode tabs
- [ ] Simplified settings

### V4 - Future
- [ ] Generate mode (image/content generation)
- [ ] Multiple provider support (OpenRouter, Anthropic)
- [ ] Export/import chat history
- [ ] Optional encryption
