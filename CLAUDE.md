# Alpha Arena - Model Chat Implementation Plan

## Overview

Refactoring the broadcast system into a unified Model Chat where:
- **Models** stream their trading analysis, trades, and commentary
- **Users** ask questions and receive **streaming** responses from an **Assistant**
- All messages use ai-sdk's `UIMessage` format with custom metadata
- Messages are tied to the **trading session** (no separate chat session)

---

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
│                 (hooks/chat/useChatMessages.ts)                 │
│            Adapted for arena mode with trading context          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Next.js API Route                             │
│                   (app/api/chat/route.ts)                       │
│         Adapted to handle arena mode                            │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────────┐   ┌───────────────────────────────┐
│   Supabase Database         │   │      Chat Agent               │
│  (arena_chat_messages)      │   │  (lib/ai/agents/chatAgent.ts) │
│  Full JSONB storage         │   │  Adapted for arena context    │
└─────────────────────────────┘   └───────────────────────────────┘
```

---

## Data Model

### Using ai-sdk UIMessage + Custom Metadata

Following ai-sdk patterns, we extend `UIMessage` with typed metadata:

```typescript
// types/chat.ts

import type { UIMessage } from "ai";

// Custom metadata for arena chat messages
export interface ArenaChatMetadata {
  sessionId: string;           // trading_sessions.id
  authorType: 'model' | 'user' | 'assistant';
  authorId: string;            // model_id, visitorIP, or 'assistant'
  messageType: 'analysis' | 'trade' | 'commentary' | 'user' | 'assistant';
  relatedTradeId?: string;
  createdAt: number;           // timestamp ms
}

// Arena chat message = UIMessage with our metadata
export type ArenaChatMessage = UIMessage<ArenaChatMetadata>;

// With author display info (for rendering)
export interface ArenaChatMessageWithAuthor extends ArenaChatMessage {
  author: {
    name: string;
    avatarUrl?: string;
    color?: string;
  };
}
```

### Database Schema (Full JSONB)

Store `UIMessage` as-is for simplicity and future compatibility:

```sql
CREATE TABLE arena_chat_messages (
  id TEXT PRIMARY KEY,                                    -- UIMessage.id
  session_id UUID NOT NULL REFERENCES trading_sessions(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  parts JSONB NOT NULL,                                   -- UIMessage.parts
  metadata JSONB,                                         -- ArenaChatMetadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_arena_chat_session ON arena_chat_messages(session_id, created_at);
CREATE INDEX idx_arena_chat_metadata ON arena_chat_messages USING GIN (metadata);
```

### Role Mapping

| authorType | messageType | role (ai-sdk) |
|------------|-------------|---------------|
| model | analysis/trade/commentary | assistant |
| user | user | user |
| assistant | assistant | assistant |

Models use `role: 'assistant'` because they generate AI content.

---

## File Structure

### Files to Modify

```
hooks/chat/
├── useChatMessages.ts      # ADD arena mode support
├── useSessions.ts          # KEEP for reference
├── useModels.ts            # KEEP for reference
└── index.ts                # UPDATE exports

store/
└── chatStore.ts            # SIMPLIFY - remove session management

lib/cache/
└── messages.ts             # RENAME to chat.ts, add arena cache

app/api/chat/
└── route.ts                # ADD arena mode handling

lib/ai/agents/
└── chatAgent.ts            # ADD arena assistant persona

lib/supabase/
└── arena.ts                # ADD arena chat message functions
```

### Files to Create

```
components/chat/
├── index.ts                # Exports
├── ModelChatFeed.tsx       # Main feed (replaces BroadcastFeed)
├── ChatMessage.tsx         # Single message (replaces BroadcastCard)
└── ChatInput.tsx           # User input field
```

### Files to Delete (after migration)

```
components/broadcast/       # Replaced by components/chat/
lib/arena/hooks/useBroadcasts.ts  # Replaced by useChatMessages with arena mode
```

---

## Adapting Existing Code

### 1. `useChatMessages.ts` - Add Arena Mode

```typescript
// hooks/chat/useChatMessages.ts

interface UseChatMessagesOptions {
  sessionId: string | null;
  mode?: 'user-chat' | 'arena';  // NEW: context mode
}

// In arena mode:
// - sessionId is trading_sessions.id
// - Load messages from arena_chat_messages table
// - Include model broadcasts in the feed
// - No "new chat" concept - messages belong to trading session
```

**Transport for arena mode:**

```typescript
const transport = useMemo(() =>
  new DefaultChatTransport({
    api: "/api/chat",
    fetch: customFetch,
    prepareSendMessagesRequest: ({ messages }) => {
      return {
        body: {
          message: messages[messages.length - 1],
          sessionId: currentSessionIdRef.current,  // trading_sessions.id
          mode: 'arena',  // Tell server to use arena context
        },
      };
    },
  }),
  [customFetch]
);
```

### 2. `app/api/chat/route.ts` - Add Arena Mode

```typescript
// app/api/chat/route.ts

interface ChatRequest {
  message: UIMessage;
  sessionId: string | null;
  mode?: 'user-chat' | 'arena';  // NEW
  model?: string;
  tools?: { ... };
}

export async function POST(req: Request) {
  const { message, sessionId, mode = 'user-chat', model, tools } = await req.json();
  
  if (mode === 'arena') {
    return handleArenaChat(req, message, sessionId);
  }
  
  // Existing user-chat logic...
}

async function handleArenaChat(
  req: Request,
  message: UIMessage,
  sessionId: string
) {
  // 1. Load recent arena messages for context
  const previousMessages = await getArenaChatMessages(sessionId, 50);
  
  // 2. Save user message with metadata
  await saveArenaChatMessage({
    ...message,
    metadata: {
      sessionId,
      authorType: 'user',
      authorId: getVisitorId(req),  // IP or fingerprint
      messageType: 'user',
      createdAt: Date.now(),
    },
  });
  
  // 3. Stream assistant response
  const result = streamText({
    model: getModel("openrouter/gpt-4o-mini"),
    system: ARENA_ASSISTANT_PROMPT,
    messages: await convertToModelMessages([...previousMessages, message]),
  });
  
  return result.toUIMessageStreamResponse({
    originalMessages: [...previousMessages, message],
    messageMetadata: ({ part }) => {
      if (part.type === 'finish') {
        return {
          sessionId,
          authorType: 'assistant',
          authorId: 'assistant',
          messageType: 'assistant',
          createdAt: Date.now(),
        };
      }
    },
    onFinish: async ({ messages }) => {
      // Save assistant response
      const assistantMessage = messages[messages.length - 1];
      await saveArenaChatMessage(assistantMessage);
    },
  });
}
```

### 3. `chatAgent.ts` - Add Arena Context

```typescript
// lib/ai/agents/chatAgent.ts

const ARENA_ASSISTANT_PROMPT = `You are the Arena Assistant, helping users understand the trading models' behavior in the Alpha Arena prediction market competition.

You have context of:
- Recent messages from trading models (their analysis, trades, commentary)
- The conversation history in this trading session

Guidelines:
- Be concise and helpful
- Reference specific model actions when relevant
- If asked about a model's reasoning, summarize their recent broadcasts
- If you don't know something, say so
- Keep responses focused on trading activity`;

// Add to chatCallOptionsSchema
const chatCallOptionsSchema = z.object({
  model: z.string().default("openrouter/gpt-4o"),
  mode: z.enum(["user-chat", "arena"]).default("user-chat"),  // NEW
  tools: z.object({
    generateImage: z.boolean().default(false),
    generateVideo: z.boolean().default(false),
    webSearch: z.boolean().default(false),
  }).default({ ... }),
});

// In prepareCall
prepareCall: ({ options, ...settings }) => {
  const isArenaMode = options.mode === 'arena';
  
  return {
    ...settings,
    model: getModel(isArenaMode ? "openrouter/gpt-4o-mini" : options.model),
    instructions: isArenaMode ? ARENA_ASSISTANT_PROMPT : DEFAULT_SYSTEM_PROMPT,
    activeTools: isArenaMode ? undefined : activeTools,  // No tools in arena mode
  };
},
```

### 4. `chatStore.ts` - Simplify

Remove session management (arena uses trading session from URL):

```typescript
// store/chatStore.ts

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

interface ChatState {
  // REMOVED: currentSessionId, sessionRefreshTrigger, newChatCounter
  
  /** Connection status to AI */
  connectionStatus: ConnectionStatus;

  /** Whether the AI is currently generating a response */
  isGenerating: boolean;

  /** Error message if any */
  error: string | null;

  setConnectionStatus: (status: ConnectionStatus) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  reset: () => void;
}

// No persistence needed - these are transient UI states
export const useChatStore = create<ChatState>()((set) => ({
  connectionStatus: "idle",
  isGenerating: false,
  error: null,

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  
  setIsGenerating: (isGenerating) => set({
    isGenerating,
    connectionStatus: isGenerating ? "connected" : "idle",
  }),

  setError: (error) => set({
    error,
    connectionStatus: error ? "error" : "idle",
    isGenerating: false,
  }),

  clearError: () => set({ error: null, connectionStatus: "idle" }),
  
  reset: () => set({
    connectionStatus: "idle",
    isGenerating: false,
    error: null,
  }),
}));
```

### 5. `lib/cache/messages.ts` - Adapt for Arena

Rename to `lib/cache/chat.ts` and add arena functions:

```typescript
// lib/cache/chat.ts

import type { UIMessage } from "ai";

const USER_CHAT_PREFIX = "aimo-chat-messages-";
const ARENA_CHAT_PREFIX = "aimo-arena-chat-";
const CACHE_VERSION = "v1";

// Existing user-chat cache functions...
export function getCachedMessages(sessionId: string): UIMessage[] { ... }
export function setCachedMessages(sessionId: string, messages: UIMessage[]): void { ... }

// NEW: Arena chat cache functions
export function getArenaCachedMessages(tradingSessionId: string): UIMessage[] {
  if (!isBrowser()) return [];
  try {
    const key = `${ARENA_CHAT_PREFIX}${CACHE_VERSION}-${tradingSessionId}`;
    const cached = localStorage.getItem(key);
    if (!cached) return [];
    return JSON.parse(cached);
  } catch {
    return [];
  }
}

export function setArenaCachedMessages(
  tradingSessionId: string,
  messages: UIMessage[]
): void {
  if (!isBrowser()) return;
  try {
    const key = `${ARENA_CHAT_PREFIX}${CACHE_VERSION}-${tradingSessionId}`;
    localStorage.setItem(key, JSON.stringify(messages));
  } catch {
    clearOldCaches();
  }
}

export function clearArenaCachedMessages(tradingSessionId: string): void {
  if (!isBrowser()) return;
  const key = `${ARENA_CHAT_PREFIX}${CACHE_VERSION}-${tradingSessionId}`;
  localStorage.removeItem(key);
}
```

---

## Supabase Functions

Add to `lib/supabase/arena.ts`:

```typescript
// ============================================================================
// ARENA CHAT MESSAGES
// ============================================================================

import type { UIMessage } from "ai";
import type { ArenaChatMetadata, ArenaChatMessage } from "@/types/chat";

export async function getArenaChatMessages(
  sessionId: string,
  limit = 100
): Promise<ArenaChatMessage[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from("arena_chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch arena chat messages:", error);
    throw error;
  }

  return (data || []).map(mapArenaChatMessage);
}

export async function saveArenaChatMessage(
  message: ArenaChatMessage
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const { error } = await client
    .from("arena_chat_messages")
    .upsert({
      id: message.id,
      session_id: message.metadata?.sessionId,
      role: message.role,
      parts: message.parts,
      metadata: message.metadata,
    }, { onConflict: "id" });

  if (error) {
    console.error("Failed to save arena chat message:", error);
    throw error;
  }
}

export async function saveArenaChatMessages(
  messages: ArenaChatMessage[]
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase not configured");

  const inserts = messages.map(msg => ({
    id: msg.id,
    session_id: msg.metadata?.sessionId,
    role: msg.role,
    parts: msg.parts,
    metadata: msg.metadata,
  }));

  const { error } = await client
    .from("arena_chat_messages")
    .upsert(inserts, { onConflict: "id" });

  if (error) {
    console.error("Failed to save arena chat messages:", error);
    throw error;
  }
}

function mapArenaChatMessage(row: Record<string, unknown>): ArenaChatMessage {
  return {
    id: row.id as string,
    role: row.role as 'user' | 'assistant',
    parts: row.parts as UIMessage['parts'],
    metadata: row.metadata as ArenaChatMetadata,
  };
}
```

---

## Component Specifications

### ModelChatFeed

```typescript
// components/chat/ModelChatFeed.tsx

interface ModelChatFeedProps {
  sessionId: string;  // trading_sessions.id
  selectedModelId?: string | null;
}

export function ModelChatFeed({ sessionId, selectedModelId }: ModelChatFeedProps) {
  const { 
    messages, 
    isLoading, 
    error, 
    sendMessage,
    input,
    setInput,
  } = useChatMessages({ 
    sessionId, 
    mode: 'arena' 
  });
  
  // Filter by model if selected
  const filteredMessages = useMemo(() => {
    if (!selectedModelId) return messages;
    return messages.filter(m => 
      m.metadata?.authorType !== 'model' || 
      m.metadata?.authorId === selectedModelId
    );
  }, [messages, selectedModelId]);
  
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5" />
          Model Chat
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4">
          {filteredMessages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {filteredMessages.map(msg => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
      
      <CardFooter className="pt-3">
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={() => {
            if (input.trim()) {
              sendMessage(input);
              setInput("");
            }
          }}
          disabled={isLoading}
        />
      </CardFooter>
    </Card>
  );
}
```

### ChatMessage

```typescript
// components/chat/ChatMessage.tsx

interface ChatMessageProps {
  message: ArenaChatMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { authorType, authorId, messageType } = message.metadata ?? {};
  
  const isUser = authorType === 'user';
  const isAssistant = authorType === 'assistant';
  const isModel = authorType === 'model';
  
  // Get author display info
  const author = useAuthorInfo(authorType, authorId);
  
  return (
    <div className={cn("p-4 rounded-lg", {
      "bg-muted/30": isModel,
      "bg-primary/10 ml-8": isUser,
      "bg-secondary/20": isAssistant,
    })}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div 
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: author.color || '#6366f1' }}
        >
          {author.name.charAt(0)}
        </div>
        <span className="font-medium text-sm">{author.name}</span>
        
        {isModel && messageType && (
          <MessageTypeBadge type={messageType} />
        )}
        
        <span className="text-xs text-muted-foreground ml-auto">
          {formatTimeAgo(message.metadata?.createdAt)}
        </span>
      </div>
      
      {/* Content - render parts */}
      <div className="text-sm leading-relaxed">
        {message.parts?.map((part, i) => (
          <MessagePart key={i} part={part} />
        ))}
      </div>
    </div>
  );
}
```

### ChatInput

```typescript
// components/chat/ChatInput.tsx

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export function ChatInput({ value, onChange, onSend, disabled }: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };
  
  return (
    <div className="flex gap-2 w-full">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about the models' trades..."
        disabled={disabled}
        maxLength={500}
        className="flex-1"
      />
      <Button 
        onClick={onSend} 
        disabled={disabled || !value.trim()}
        size="icon"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

---

## Rate Limiting

> **TODO**: Implement rate limiting systematically later.

Add placeholder comments in API route:

```typescript
// app/api/chat/route.ts

async function handleArenaChat(...) {
  // TODO: Implement rate limiting
  // - Limit by IP: X requests per minute
  // - Return 429 with Retry-After header when exceeded
  // - Consider using Upstash Redis for serverless rate limiting
  
  // ... rest of handler
}
```

---

## Migration Steps

### Phase 1: Database & Types
- [ ] Add `ArenaChatMetadata` type to `types/chat.ts`
- [ ] Create `arena_chat_messages` table in Supabase
- [ ] Add Supabase functions to `lib/supabase/arena.ts`

### Phase 2: Cache & Store
- [ ] Rename `lib/cache/messages.ts` → `lib/cache/chat.ts`
- [ ] Add arena cache functions
- [ ] Simplify `store/chatStore.ts` (remove session management)

### Phase 3: API & Agent
- [ ] Add arena mode to `app/api/chat/route.ts`
- [ ] Add arena assistant prompt to `lib/ai/agents/chatAgent.ts`
- [ ] Test streaming response with metadata

### Phase 4: Hooks
- [ ] Add `mode: 'arena'` option to `useChatMessages.ts`
- [ ] Update transport for arena context
- [ ] Load messages from `arena_chat_messages`

### Phase 5: Components
- [ ] Create `components/chat/ModelChatFeed.tsx`
- [ ] Create `components/chat/ChatMessage.tsx`
- [ ] Create `components/chat/ChatInput.tsx`
- [ ] Create `components/chat/index.ts`

### Phase 6: Integration & Cleanup
- [ ] Update Arena page to use `ModelChatFeed`
- [ ] Update model agents to save broadcasts via `saveArenaChatMessage()`
- [ ] Migrate existing broadcasts to new table (or keep both during transition)
- [ ] Delete `components/broadcast/` directory
- [ ] Delete `lib/arena/hooks/useBroadcasts.ts`

---

## Design Principles

1. **UIMessage + Metadata** - Use ai-sdk's `UIMessage` directly, custom fields in `metadata`
2. **Full JSONB Storage** - Store `parts` and `metadata` as JSONB for simplicity and future compatibility
3. **Trading Session Context** - No separate chat session; messages belong to trading session
4. **Streaming for All** - Both model broadcasts and assistant responses stream
5. **Reuse Existing Code** - Adapt `useChatMessages`, `/api/chat`, `chatAgent` rather than creating new
6. **Simplified Client State** - Remove session management from chatStore, keep only transient UI states
7. **LocalStorage Cache** - Keep message caching for faster page loads
