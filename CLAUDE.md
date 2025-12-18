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
3. **Supabase-first storage** - Supabase for persistence, localStorage for caching
4. **Minimal configuration** - Works out of the box with sensible defaults
5. **Customizable** - Easy to theme and extend

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19 + shadcn/ui (new-york style) + Tailwind CSS 4
- **AI Integration**: Vercel AI SDK (`ai` package v6, `@ai-sdk/openai`, `@ai-sdk/mcp`)
- **State Management**: Zustand (minimal, UI-only state)
- **Storage**: Supabase (primary) + localStorage (read cache)
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
│   ├── page.tsx                 # Main entry (redirects to /chat/new)
│   ├── layout.tsx               # Root layout with providers + AppSidebar
│   ├── chat/
│   │   ├── new/
│   │   │   └── page.tsx         # New chat page (no session yet)
│   │   └── [id]/
│   │       └── page.tsx         # Session-specific chat page
│   ├── store/
│   │   ├── page.tsx             # Store listing (models, agents, tools)
│   │   └── [id]/
│   │       └── page.tsx         # StoreItem detail page (unified)
│   └── api/
│       ├── chat/
│       │   └── route.ts         # Chat API with persistence + tool execution
│       ├── sessions/
│       │   └── route.ts         # Session CRUD API (read-only for client)
│       ├── models/
│       │   └── route.ts         # Models registry proxy
│       ├── agents/
│       │   └── route.ts         # Agents registry proxy
│       └── tools/
│           └── route.ts         # Tools registry proxy
├── components/
│   ├── ui/                      # shadcn/ui primitives
│   ├── layout/
│   │   ├── AppSidebar.tsx       # Full sidebar (sessions, nav, footer)
│   │   └── ChatSidebar.tsx      # Session list with search, actions
│   ├── chat/
│   │   ├── ChatInterface.tsx    # Main chat container (with header)
│   │   ├── ChatModelSelector.tsx    # Model selection dropdown
│   │   ├── ChatAgentSelector.tsx    # Agent selection dropdown
│   │   └── ChatToolSelector.tsx     # Tool selection multi-select
│   ├── store/
│   │   └── ...                  # Store components
│   └── ai-elements/
│       └── ...                  # Message rendering components
├── hooks/
│   ├── chat/
│   │   ├── useChatMessages.ts   # Chat logic hook (AI SDK wrapper, no persistence)
│   │   ├── useSessions.ts       # Session list management (fetch from API)
│   │   └── ...                  # Other chat hooks
│   └── store/
│       └── ...                  # Store hooks
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # Supabase browser client (read-only)
│   │   ├── server.ts            # Supabase server client (read/write)
│   │   └── types.ts             # Database types
│   ├── cache/
│   │   └── messages.ts          # localStorage cache utilities
│   └── utils.ts                 # Utility functions
├── store/
│   ├── sessionStore.ts          # Current session ID (UI state only)
│   └── ...                      # Other UI state stores
├── types/
│   ├── chat.ts                  # Message, Session types
│   └── ...                      # Other types
└── ...
```

## Configuration

### Environment Variables

```bash
# .env.local

# Required: AiMo Network API Key (or OpenAI-compatible key)
OPENAI_API_KEY=sk-...

# Required: Supabase configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server-side only

# Optional: Default model (defaults to openai/gpt-4o)
# DEFAULT_MODEL=openai/gpt-4o
```

---

## Architecture Decisions

### No Authentication (Current)

The app has no user accounts or authentication. This is intentional:

- Simpler setup (just add API key via env and go)
- Privacy-friendly (no tracking)
- Supabase anon key provides basic access control

### Storage Architecture: Supabase-First with Local Cache

```
┌─────────────────────────────────────────────────────────────────────┐
│  Storage Architecture                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐     read cache      ┌─────────────────────────┐   │
│  │ localStorage│◀───────────────────│      Client (React)      │   │
│  │   (cache)   │                     │                         │   │
│  └─────────────┘                     └───────────┬─────────────┘   │
│                                                  │                  │
│                                      send last message only         │
│                                                  │                  │
│                                                  ▼                  │
│                                      ┌─────────────────────────┐   │
│                                      │     /api/chat           │   │
│                                      │  (Next.js API Route)    │   │
│                                      └───────────┬─────────────┘   │
│                                                  │                  │
│                                      load & save (server-side)      │
│                                                  │                  │
│                                                  ▼                  │
│                                      ┌─────────────────────────┐   │
│                                      │       Supabase          │   │
│                                      │   (Primary Storage)     │   │
│                                      └─────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Supabase (Primary)**
- All sessions and messages persisted server-side
- Server-side ID generation for consistency
- Unlimited storage, cross-device sync
- Required for the app to function

**localStorage (Read Cache)**
- Cache messages on page load for faster subsequent loads
- Stale-while-revalidate pattern
- No write-through (server is source of truth)
- Graceful degradation if unavailable

### Server-Side Persistence (AI SDK Pattern)

Following the Vercel AI SDK recommended pattern for message persistence:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Message Flow                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. User clicks "New Chat"                                          │
│     └─▶ Navigate to /chat/new (no API call, no session yet)        │
│                                                                     │
│  2. User sends first message                                        │
│     └─▶ POST /api/chat { message: "Hello", sessionId: null }       │
│                                                                     │
│  3. Server: No sessionId                                            │
│     ├─▶ Create session in Supabase (server-generated ID)           │
│     ├─▶ Generate user message ID (server-side)                     │
│     ├─▶ Save user message                                          │
│     ├─▶ Call AI, get response                                      │
│     ├─▶ Generate AI message ID (server-side)                       │
│     ├─▶ Save AI message                                            │
│     └─▶ Return stream with { sessionId, messages }                 │
│                                                                     │
│  4. Client receives response                                        │
│     ├─▶ Update URL to /chat/{sessionId}                            │
│     └─▶ Display messages with server-assigned IDs                  │
│                                                                     │
│  5. Subsequent messages                                             │
│     └─▶ POST /api/chat { message: "...", sessionId: "{id}" }       │
│         ├─▶ Server loads previous messages from Supabase           │
│         ├─▶ Appends new message, calls AI                          │
│         ├─▶ Saves all messages in onFinish                         │
│         └─▶ Uses consumeStream() for disconnect handling           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### ID Generation Strategy

All IDs are generated server-side for consistency:

| Entity | Generator | Location |
|--------|-----------|----------|
| Session ID | `crypto.randomUUID()` | `/api/chat` (on first message) |
| User Message ID | `createIdGenerator({ prefix: 'msg' })` | `/api/chat` |
| AI Message ID | `generateMessageId` option | `toUIMessageStreamResponse()` |

```typescript
// In /api/chat route
return result.toUIMessageStreamResponse({
  originalMessages: messages,
  generateMessageId: createIdGenerator({
    prefix: 'msg',
    size: 16,
  }),
  onFinish: async ({ messages }) => {
    await saveChat({ sessionId, messages });
  },
});
```

### Offline Support: Read-Only

Since AI chat requires network connectivity, offline support is limited to reading:

```typescript
function ChatInterface() {
  const isOnline = useOnlineStatus();

  return (
    <>
      {!isOnline && (
        <Banner variant="warning">
          You're offline. Connect to send messages.
        </Banner>
      )}
      <MessageList messages={cachedMessages} />
      <PromptInput disabled={!isOnline} />
    </>
  );
}
```

- **Online**: Full functionality
- **Offline**: Browse cached sessions/messages, sending disabled

### Message Validation

Using strict validation per AI SDK recommendation:

```typescript
// In /api/chat route
import { validateUIMessages, TypeValidationError } from 'ai';

try {
  const validatedMessages = await validateUIMessages({
    messages: [...previousMessages, newMessage],
    tools,           // Validate tool calls match current schemas
    metadataSchema,  // Validate custom metadata
  });
} catch (error) {
  if (error instanceof TypeValidationError) {
    // Log and handle invalid messages
    console.error('Message validation failed:', error);
  }
  throw error;
}
```

### Client-Server Communication

Only send the last message to reduce payload size:

```typescript
// Client: useChatMessages.ts
const transport = new DefaultChatTransport({
  api: '/api/chat',
  prepareSendMessagesRequest({ messages, id }) {
    return {
      body: {
        message: messages[messages.length - 1],
        sessionId: id,
        model: selectedModelId,
        enabledTools,
      },
    };
  },
});
```

```typescript
// Server: /api/chat/route.ts
export async function POST(req: Request) {
  const { message, sessionId, model, enabledTools } = await req.json();

  // Load previous messages from Supabase
  const previousMessages = sessionId
    ? await loadMessages(sessionId)
    : [];

  // Validate and append new message
  const messages = await validateUIMessages({
    messages: [...previousMessages, message],
    tools,
  });

  // ... rest of chat logic
}
```

### Disconnect Handling

Use `consumeStream()` to ensure messages are saved even if client disconnects:

```typescript
// In /api/chat route
const result = streamText({
  model: aimo.chat(modelId),
  messages: convertToModelMessages(messages),
  tools,
});

// Consume stream to ensure onFinish is called even on disconnect
result.consumeStream(); // No await - runs in background

return result.toUIMessageStreamResponse({
  originalMessages: messages,
  onFinish: async ({ messages }) => {
    // This will run even if client disconnects
    await saveChat({ sessionId, messages });
  },
});
```

---

## Database Schema

### Supabase Tables

```sql
-- chat_sessions table
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'New Chat',
  model_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- chat_messages table
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,                    -- Server-generated with prefix
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT,                           -- Plain text fallback
  parts JSONB,                            -- AI SDK parts array (rich content)
  model TEXT,                             -- Model that generated the message
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_messages_session ON chat_messages(session_id);
CREATE INDEX idx_messages_created ON chat_messages(created_at);
CREATE INDEX idx_sessions_updated ON chat_sessions(updated_at DESC);
```

### Message Parts Format

Messages store both plain `content` and rich `parts` array:

```typescript
interface PersistedMessage {
  id: string;                    // "msg_abc123..."
  session_id: string;            // UUID
  role: "user" | "assistant" | "system";
  content: string;               // Plain text for fallback/search
  parts: MessagePart[];          // Rich content from AI SDK
  model: string | null;          // Model ID (for assistant messages)
  created_at: string;            // ISO timestamp
}

// Parts can include:
// - { type: "text", text: "..." }
// - { type: "file", mediaType: "image/png", data: "base64..." }
// - { type: "tool-invocation", toolName: "...", ... }
```

---

## Implementation Plan

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `app/api/chat/route.ts` | **Modify** | Add server-side persistence, ID generation |
| `app/api/sessions/route.ts` | **Create** | Session CRUD API (GET list, DELETE) |
| `app/chat/new/page.tsx` | **Create** | New chat page (no session ID) |
| `hooks/chat/useChatMessages.ts` | **Modify** | Remove client-side persistence, add transport config |
| `hooks/chat/useSessions.ts` | **Modify** | Fetch from API instead of storage adapter |
| `lib/cache/messages.ts` | **Create** | localStorage cache utilities |
| `lib/supabase/messages.ts` | **Create** | Server-side message CRUD |
| `lib/storage/` | **Delete** | Remove old storage adapter pattern |
| `components/chat/ChatInterface.tsx` | **Modify** | Handle /chat/new vs /chat/[id], URL updates |

### Migration Steps

1. **Create server-side persistence layer** (`lib/supabase/messages.ts`)
2. **Update `/api/chat` route** with full persistence logic
3. **Create `/api/sessions` route** for session list/delete
4. **Update `useChatMessages` hook** to remove client persistence
5. **Update `useSessions` hook** to fetch from API
6. **Add localStorage cache layer** for faster loads
7. **Update ChatInterface** to handle new chat flow
8. **Remove old storage adapters** (`lib/storage/`)
9. **Add offline detection** and read-only mode

---

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
// Zustand store - UI state only, no persistence logic
export const useSessionStore = create<SessionState>((set) => ({
  currentSessionId: null,
  setCurrentSession: (id) => set({ currentSessionId: id }),
}));
```

---

## Roadmap

### V1 ✅ COMPLETE
- [x] Basic chat interface with AiMo Network
- [x] Model selection (fetched from registry)
- [x] Session management (localStorage)
- [x] Markdown rendering
- [x] Code syntax highlighting
- [x] Dark/light theme

### V2 ✅ COMPLETE
- [x] Store page (models, agents, tools listing)
- [x] Agent selection in chat
- [x] Tool selection in chat (multi-select)
- [x] Built-in AI SDK tools
- [x] MCP tool support

### V3 (Message Persistence Refactor) ← CURRENT
- [ ] Server-side message persistence in `/api/chat`
- [ ] Server-side ID generation (sessions + messages)
- [ ] Send only last message to server
- [ ] localStorage read cache
- [ ] Session list from API
- [ ] Disconnect handling with `consumeStream()`
- [ ] Message validation with `validateUIMessages`
- [ ] Read-only offline mode
- [ ] URL update on session creation

### V4 (Future)
- [ ] Image generation integration
- [ ] Multi-modal input (image attachments)
- [ ] Export/import sessions
- [ ] Tool approval workflow
