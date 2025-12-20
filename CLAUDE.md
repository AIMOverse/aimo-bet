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

## Architecture

### System Overview

```
┌─────────────┐      ┌─────────────────┐      ┌──────────────────┐
│   Client    │ ───► │  Next.js API    │ ───► │  AI Inference    │
│  (Browser)  │      │   (route.ts)    │      │  (AiMo Network)  │
└─────────────┘      └────────┬────────┘      └──────────────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │    Supabase     │
                     │   (Storage)     │
                     └─────────────────┘
```

The Next.js server acts as a middle layer between:
- **Client**: Browser running the chat UI
- **AI Inference**: Stateless LLM API (AiMo Network) - separate server
- **Storage**: Supabase for persistence - separate server

### Message Flow Pattern

**Client sends full message history with each request.** The AI SDK's `useChat` hook manages client-side state and sends the complete `messages[]` array.

```typescript
// Client (via useChat + sendMessage)
sendMessage(
  { text: input },
  {
    body: {
      sessionId: currentSessionId,
      model: selectedModel,
    },
  },
);

// Server receives full history + custom fields
const { messages, sessionId, model }: {
  messages: UIMessage[];
  sessionId: string | null;
  model?: string;
} = await req.json();
```

**Why this pattern:**
- AI inference server is stateless (needs full context every call)
- Client already has messages in memory (no redundant DB read)
- Simpler architecture: DB is write-during-chat, read-on-resume
- Aligns with AI SDK's native `useChat` behavior

**DB reads only occur when:**
- User reopens an existing session (page load/refresh)
- Not on every message exchange

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
│   └── api/
│       └── chat/route.ts        # Chat API (proxies to inference)
├── components/
│   ├── ui/                      # shadcn/ui primitives
│   ├── layout/                  # AppSidebar, AppHeader, ThemeProvider
│   └── chat/                    # ChatInterface, ChatSidebar, etc.
├── lib/
│   ├── ai/                      # AI integration layer
│   │   ├── middleware/          # Language model middleware
│   │   ├── providers/           # Custom provider configurations
│   │   └── registry.ts          # Unified provider registry
│   └── supabase/                # Database operations
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

## AI Integration

### Provider Registry (`lib/ai/registry.ts`)

Centralized model access through string IDs:

```typescript
import { getModel } from '@/lib/ai/registry';

// Usage: getModel('aimo/gpt-oss-120b')
const model = getModel(modelId);
```

### API Route Pattern (`app/api/chat/route.ts`)

```typescript
import { streamText, UIMessage } from 'ai';
import { getModel } from '@/lib/ai/registry';

export async function POST(req: Request) {
  const { messages, sessionId, model } = await req.json();

  const result = streamText({
    model: getModel(model),
    system: DEFAULT_SYSTEM_PROMPT,
    messages,
  });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ messages }) => {
      await saveChat({ sessionId, messages });
    },
  });
}
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
