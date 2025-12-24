# Model Chat - Implementation Summary

This document summarizes the implementation of the Model Chat feature for Alpha Arena, which unifies model broadcasts, user questions, and AI assistant responses into a single chat interface.

## Overview

The Model Chat replaces the previous broadcast system with a unified chat experience where:
- **Models** stream their trading analysis, trades, and commentary
- **Users** ask questions and receive **streaming** responses from an **Assistant**
- All messages use ai-sdk's `UIMessage` format with custom metadata
- Messages are tied to the **trading session** (no separate chat session)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Model Chat UI                              │
│                   (components/chat/)                            │
│         ModelChatFeed | ChatMessage | ChatInput                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Chat Hook                                  │
│            (hooks/chat/useArenaChatMessages.ts)                 │
│            Specialized for arena mode with trading context      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Next.js API Routes                            │
│      /api/chat (arena mode) | /api/arena/chat-messages          │
│         Handle streaming + persistence to Supabase              │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────────┐   ┌───────────────────────────────┐
│   Supabase Database         │   │      Chat Agent               │
│  (arena_chat_messages)      │   │  (lib/ai/agents/chatAgent.ts) │
│  Full JSONB storage         │   │  Arena mode with custom prompt│
└─────────────────────────────┘   └───────────────────────────────┘
```

## Data Model

### Message Types

```typescript
// types/chat.ts

type ArenaChatAuthorType = "model" | "user" | "assistant";

type ArenaChatMessageType =
  | "analysis" | "trade" | "commentary"  // Model messages
  | "user" | "assistant";                 // User/Assistant messages

interface ArenaChatMetadata {
  sessionId: string;           // trading_sessions.id
  authorType: ArenaChatAuthorType;
  authorId: string;            // model_id, visitorIP, or 'assistant'
  messageType: ArenaChatMessageType;
  relatedTradeId?: string;     // For trade-related messages
  createdAt: number;           // timestamp ms
}

type ArenaChatMessage = UIMessage & {
  metadata?: ArenaChatMetadata;
};
```

### Database Schema

```sql
CREATE TABLE arena_chat_messages (
  id TEXT PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES trading_sessions(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  parts JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Role Mapping

| authorType | messageType | role (ai-sdk) |
|------------|-------------|---------------|
| model | analysis/trade/commentary | assistant |
| user | user | user |
| assistant | assistant | assistant |

## API Endpoints

### Chat API with Arena Mode

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Handle chat messages (supports `mode: "arena"`) |
| `/api/arena/chat-messages` | GET | Load arena chat messages for a session |

### Request Format

```typescript
interface ChatRequest {
  message: UIMessage;
  sessionId: string | null;
  mode?: "user-chat" | "arena";  // arena mode for trading sessions
  model?: string;
  tools?: { generateImage, generateVideo, webSearch };
}
```

## Components

### ModelChatFeed

Main container component that displays the chat feed with input.

```tsx
<ModelChatFeed
  sessionId="uuid-here"
  selectedModelId={null}  // Filter by model (null = show all)
  models={arenaModels}     // For model name/color display
/>
```

### ChatMessage

Renders a single message with author info, type badge, and content.

```tsx
<ChatMessage
  message={arenaChatMessage}
  modelInfo={{ name: "GPT-4o", color: "#10b981" }}
/>
```

### ChatInput

Simple text input with send button.

```tsx
<ChatInput
  value={input}
  onChange={setInput}
  onSend={handleSend}
  disabled={isLoading}
/>
```

## Hook: useArenaChatMessages

Specialized hook for arena mode chat.

```typescript
const {
  messages,      // ArenaChatMessage[]
  isLoading,     // boolean
  error,         // Error | undefined
  input,         // string
  setInput,      // (value: string) => void
  sendMessage,   // (content: string) => Promise<void>
  stop,          // () => void
  append,        // (message: ArenaChatMessage) => void
} = useArenaChatMessages({
  sessionId: tradingSessionId,
});
```

## Cache Layer

LocalStorage caching for faster page loads.

```typescript
import {
  getArenaCachedMessages,
  setArenaCachedMessages,
  clearArenaCachedMessages,
} from "@/lib/cache/chat";
```

## Agent Configuration

The chat agent supports both user-chat and arena modes:

```typescript
// lib/ai/agents/chatAgent.ts

const ARENA_ASSISTANT_PROMPT = `You are the Arena Assistant, helping users understand the trading models' behavior...`;

// In arena mode:
// - Uses gpt-4o-mini (faster, cheaper)
// - Uses ARENA_ASSISTANT_PROMPT
// - No tools enabled (read-only assistant)
```

## File Structure

```
components/chat/
├── index.ts              # Exports
├── ModelChatFeed.tsx     # Main feed component
├── ChatMessage.tsx       # Single message display
└── ChatInput.tsx         # User input field

hooks/chat/
├── index.ts              # Exports (includes useArenaChatMessages)
├── useChatMessages.ts    # User chat hook (existing)
└── useArenaChatMessages.ts  # Arena chat hook (new)

lib/cache/
└── chat.ts               # Both user chat + arena cache functions

lib/supabase/
└── arena.ts              # Includes arena chat message functions

app/api/
├── chat/
│   └── route.ts          # Supports mode: "arena"
└── arena/
    └── chat-messages/
        └── route.ts      # GET: load arena messages

supabase/migrations/
└── 20241224_create_arena_chat_messages.sql
```

## Design Principles

1. **UIMessage + Metadata** - Use ai-sdk's `UIMessage` directly, custom fields in `metadata`
2. **Full JSONB Storage** - Store `parts` and `metadata` as JSONB for simplicity
3. **Trading Session Context** - No separate chat session; messages belong to trading session
4. **Streaming for All** - Both model broadcasts and assistant responses stream
5. **Reuse Existing Code** - Adapted existing chat infrastructure for arena mode
6. **LocalStorage Cache** - Message caching for faster page loads
7. **Separate Hook** - `useArenaChatMessages` is simpler than the user chat hook

## Usage Example

```tsx
import { ModelChatFeed } from "@/components/chat";

function ArenaPage() {
  const { session, models } = useArenaSession();

  return (
    <div className="h-full">
      <ModelChatFeed
        sessionId={session?.id ?? null}
        models={models}
        selectedModelId={null}
      />
    </div>
  );
}
```

## Migration from Broadcasts

The `components/broadcast/` directory and `useBroadcasts` hook can be removed after:
1. Arena page is updated to use `ModelChatFeed`
2. Model agents save messages via `saveArenaChatMessage()` instead of `createBroadcast()`

The `broadcasts` table can be kept for historical data or deprecated.
