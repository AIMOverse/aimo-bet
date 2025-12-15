# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**aimo-chat** is an open-source chat UI for interacting with LLMs. It's designed for developers with basic AI knowledge who want a ready-to-use chat interface with their own API keys (BYOK - Bring Your Own Key).

### Target Audience

- Developers who want a local chat UI without vendor lock-in
- Teams needing a self-hosted chat solution
- Anyone who wants to use OpenAI, OpenRouter, Anthropic, or compatible APIs

### Key Principles

1. **Zero account required** - No sign-up, no auth, just add your API key and start chatting
2. **BYOK (Bring Your Own Key)** - Works with any OpenAI-compatible API
3. **Dual storage** - localStorage for offline/local use, optional Supabase for persistence
4. **Minimal configuration** - Works out of the box with sensible defaults
5. **Customizable** - Easy to theme and extend

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19 + shadcn/ui (new-york style) + Tailwind CSS 4
- **AI Integration**: Vercel AI SDK (`ai` package v6, `@ai-sdk/openai`)
- **State Management**: Zustand (minimal, UI-only state)
- **Storage**: localStorage (default) + Supabase (optional cloud sync)
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
├── app/
│   ├── page.tsx                 # Main chat interface
│   ├── layout.tsx               # Root layout with providers
│   ├── chat/
│   │   └── [id]/
│   │       └── page.tsx         # Session-specific chat page
│   └── api/
│       └── chat/
│           └── route.ts         # Chat API proxy (OpenAI)
├── components/
│   ├── ui/                      # shadcn/ui primitives
│   ├── chat/
│   │   ├── ChatInterface.tsx    # Main chat container
│   │   ├── ChatSidebar.tsx      # Session history sidebar
│   │   └── ModelSelector.tsx    # Model selection dropdown
│   └── ai-elements/
│       ├── message.tsx          # Message bubble component
│       ├── prompt-input.tsx     # Chat input with attachments
│       ├── code-block.tsx       # Syntax-highlighted code
│       ├── conversation.tsx     # Message container with auto-scroll
│       └── ...                  # Other message renderers
├── config/
│   ├── models.ts                # Default model definitions
│   ├── providers.ts             # API provider configurations
│   └── defaults.ts              # Default settings
├── hooks/
│   ├── chat/
│   │   ├── useChat.ts           # Chat logic hook (AI SDK wrapper)
│   │   ├── useSessions.ts       # Session management
│   │   └── useModels.ts         # Model fetching/selection
│   └── store/
│       └── useHydration.ts      # Zustand hydration helper
├── lib/
│   ├── storage/
│   │   ├── interface.ts         # Storage adapter interface
│   │   ├── localStorage.ts      # localStorage implementation
│   │   └── supabase.ts          # Supabase implementation
│   ├── supabase/
│   │   ├── client.ts            # Supabase browser client
│   │   ├── server.ts            # Supabase server client
│   │   └── types.ts             # Database types
│   └── utils.ts                 # Utility functions (cn, etc.)
├── store/
│   ├── chatStore.ts             # Chat UI state
│   ├── sessionStore.ts          # Current session state
│   └── modelStore.ts            # Selected model state
├── types/
│   ├── chat.ts                  # Message, Session types
│   ├── models.ts                # Model definitions
│   └── storage.ts               # Storage adapter types
├── public/
├── .env.example                 # Environment template
├── .env.local                   # Local environment (git-ignored)
├── tailwind.config.ts
├── next.config.ts
└── package.json
```

## Configuration

### Environment Variables

```bash
# .env.local

# Required: OpenAI API Key
OPENAI_API_KEY=sk-...

# Optional: Default model (defaults to gpt-4o)
# DEFAULT_MODEL=gpt-4o

# Optional: Supabase (for cloud storage)
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Optional: Storage mode ("local" | "supabase", defaults to "local")
# NEXT_PUBLIC_STORAGE_MODE=local
```

### Model Configuration

Models are configured in `config/models.ts`:

```typescript
export const MODELS: ModelDefinition[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    contextLength: 128000,
    pricing: { prompt: 2.5, completion: 10 }, // per 1M tokens
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    contextLength: 128000,
    pricing: { prompt: 0.15, completion: 0.6 },
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    contextLength: 128000,
    pricing: { prompt: 10, completion: 30 },
  },
  // Add more models...
];
```

### Provider Configuration

Configure API providers in `config/providers.ts`:

```typescript
export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modelsEndpoint: "/models",
    envKey: "OPENAI_API_KEY",
  },
  // Future: OpenRouter, Anthropic, etc.
];
```

## Architecture Decisions

### No Authentication (V1)

The app has no user accounts or authentication. This is intentional:

- Simpler setup (just add API key via env and go)
- No backend dependencies for basic usage
- Privacy-friendly (all data stays local by default)

Future versions may add optional auth adapters for cross-device sync.

### Dual Storage Architecture

The app supports two storage backends via a unified adapter interface:

**1. localStorage (Default)**
- Zero setup required
- Works offline
- Data stays on user's machine
- ~5MB storage limit
- No cross-device sync

**2. Supabase (Optional)**
- Requires Supabase project setup
- Unlimited storage
- Cross-device sync possible
- Migrated from aimo-web-app

```typescript
// Storage adapter interface
interface StorageAdapter {
  // Sessions
  getSessions(): Promise<ChatSession[]>;
  getSession(id: string): Promise<ChatSession | null>;
  createSession(session: Omit<ChatSession, "id">): Promise<ChatSession>;
  updateSession(id: string, data: Partial<ChatSession>): Promise<void>;
  deleteSession(id: string): Promise<void>;

  // Messages
  getMessages(sessionId: string): Promise<Message[]>;
  addMessage(sessionId: string, message: Message): Promise<void>;
  updateMessage(sessionId: string, messageId: string, data: Partial<Message>): Promise<void>;
}
```

Storage mode is determined by `NEXT_PUBLIC_STORAGE_MODE` environment variable.

### API Proxy Pattern

Chat requests go through `/api/chat` route instead of calling OpenAI directly:

- Keeps API keys server-side (more secure)
- Enables rate limiting and logging
- Allows adding middleware (e.g., content filtering)

```
Browser → /api/chat → OpenAI API → Streaming Response
```

### Vercel AI SDK

We use the `ai` package (v6) for streaming chat:

- Built-in streaming support
- Provider-agnostic (works with OpenAI, Anthropic, etc.)
- React hooks for easy integration (`@ai-sdk/react`)

## Code Style

- Use `@/` path alias for imports (maps to project root)
- Use `@/lib/utils` for className merging (`cn` function)
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
export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      currentSessionId: null,
      setCurrentSession: (id) => set({ currentSessionId: id }),
    }),
    { name: "aimo-chat-session" }
  )
);
```

### Storage Adapter Pattern

```typescript
// Get storage adapter based on environment
import { getStorageAdapter } from "@/lib/storage";

const storage = getStorageAdapter();
const sessions = await storage.getSessions();
```

## Migration Plan (from aimo-web-app)

### Phase 1: Core Infrastructure (Bottom-up)
1. **Types** (`types/`)
   - `chat.ts` - Message, ChatSession, Attachment types
   - `models.ts` - ModelDefinition, ModelProvider types
   - `storage.ts` - StorageAdapter interface

2. **Config** (`config/`)
   - `models.ts` - OpenAI model definitions
   - `providers.ts` - Provider configurations
   - `defaults.ts` - Default settings

3. **Storage** (`lib/storage/`)
   - `interface.ts` - StorageAdapter interface
   - `localStorage.ts` - localStorage implementation
   - `supabase.ts` - Supabase implementation (migrate from aimo-web-app)

4. **Supabase Client** (`lib/supabase/`)
   - `client.ts` - Browser client
   - `server.ts` - Server client
   - `types.ts` - Database types (migrate from aimo-web-app)

5. **Stores** (`store/`)
   - `sessionStore.ts` - Current session state
   - `modelStore.ts` - Selected model state
   - `chatStore.ts` - Chat UI state (streaming, errors)

### Phase 2: Hooks & Logic
1. **Chat Hooks** (`hooks/chat/`)
   - `useChat.ts` - Wrapper around AI SDK useChat
   - `useSessions.ts` - Session CRUD operations
   - `useModels.ts` - Model selection logic

2. **API Route** (`app/api/chat/`)
   - `route.ts` - OpenAI chat completion proxy

### Phase 3: Chat Components
1. **Chat Components** (`components/chat/`)
   - `ChatInterface.tsx` - Main chat container
   - `ChatSidebar.tsx` - Session list sidebar
   - `ModelSelector.tsx` - Model dropdown (wire up existing ai-elements version)

### Phase 4: Pages & Layout
1. **Pages** (`app/`)
   - `page.tsx` - Main chat interface
   - `chat/[id]/page.tsx` - Session-specific view
   - `layout.tsx` - Root layout with providers

### Files to Migrate from aimo-web-app

**Migrate & Adapt:**
- `src/lib/supabase/*` → `lib/supabase/` (simplify, remove auth)
- `src/types/chat/*` → `types/chat.ts` (simplify)
- `src/store/chatStore.ts` → `store/chatStore.ts` (remove auth deps)
- `src/hooks/chat/useChatMessage.ts` → `hooks/chat/useChat.ts` (simplify)
- `src/app/api/chat/route.ts` → `app/api/chat/route.ts` (rewrite for direct OpenAI)

**Already in aimo-chat (use as-is):**
- `components/ai-elements/prompt-input.tsx` - Full-featured input
- `components/ai-elements/message.tsx` - Message display
- `components/ai-elements/code-block.tsx` - Code highlighting
- `components/ai-elements/conversation.tsx` - Message container
- `components/ai-elements/model-selector.tsx` - Model dropdown
- `components/ui/*` - All shadcn components

**NOT Migrating:**
- All wallet/auth code
- Marketplace components
- Account management
- AIMO-specific analytics
- Referral system
- Landing page
- MCP/Tools integration (deferred to V2)

## What's NOT in V1 (Deferred)

| Feature | Reason | Future Plan |
|---------|--------|-------------|
| MCP/Tools | Complexity | V2 - Add MCP server config |
| Marketplace | AIMO-specific | Not planned |
| User accounts | Simplicity | V2 - Optional auth adapters |
| Multi-provider | Focus on OpenAI first | V2 - Add OpenRouter, Anthropic |
| File attachments storage | Complexity | V2 - With Supabase storage |
| Multi-modal (images) | Provider-dependent | V2 |

## Supabase Schema

For Supabase storage mode, the following tables are needed:

```sql
-- Chat sessions (no user_id, anonymous usage)
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New Chat',
  model_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chat messages
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  attachments jsonb default '[]',
  created_at timestamptz default now()
);

-- Indexes
create index idx_messages_session on chat_messages(session_id);
create index idx_sessions_updated on chat_sessions(updated_at desc);
```

## Contributing

### Adding a New Provider (V2+)

1. Create provider config in `config/providers.ts`
2. If special handling needed, add adapter in `lib/providers/`
3. Update types in `types/providers.ts`
4. Test with the provider's API

### Adding UI Components

We use shadcn/ui. To add a new component:

```bash
pnpm dlx shadcn@latest add [component-name]
```

Components are added to `components/ui/`.

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel
3. Add environment variables:
   - `OPENAI_API_KEY` (required)
   - `NEXT_PUBLIC_SUPABASE_URL` (optional)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (optional)
   - `NEXT_PUBLIC_STORAGE_MODE` (optional, defaults to "local")
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
# Edit .env.local with your OpenAI API key
pnpm install
pnpm build
pnpm start
```

## Roadmap

### V1 (Current Target)
- [ ] Basic chat interface with OpenAI
- [ ] Model selection (GPT-4o, GPT-4o-mini, GPT-4-turbo)
- [ ] Session management (localStorage)
- [ ] Optional Supabase storage backend
- [ ] Markdown rendering
- [ ] Code syntax highlighting
- [ ] Dark/light theme
- [ ] File attachments (prompt-input supports it)

### V2 (Planned)
- [ ] Multi-provider support (OpenRouter, Anthropic)
- [ ] MCP tool support
- [ ] IndexedDB storage option
- [ ] Optional auth adapters
- [ ] Export/import sessions

### V3 (Future)
- [ ] Multi-modal (images, vision)
- [ ] Plugin system
- [ ] Real-time collaboration
