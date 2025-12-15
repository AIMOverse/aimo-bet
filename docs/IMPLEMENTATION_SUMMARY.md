# Implementation Summary: Chat Module Migration

This document summarizes the migration of chat functionality from `aimo-web-app` to `aimo-chat`, making it open-source and BYOK-first (Bring Your Own Key).

## Overview

The migration involved extracting core chat functionality while:
- Removing account/wallet authentication dependencies
- Implementing dual storage (localStorage + optional Supabase)
- Upgrading to AI SDK v6's new transport-based architecture
- Making OpenAI the primary provider with environment variable configuration

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer                                  │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ ChatSidebar  │  │  ChatInterface   │  │ ChatModelSelector│  │
│  └──────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                       Hooks Layer                                │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ useSessions  │  │ useChatMessages  │  │    useModels     │  │
│  └──────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                       State Layer                                │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ sessionStore │  │    chatStore     │  │   modelStore     │  │
│  │  (Zustand)   │  │    (Zustand)     │  │   (Zustand)      │  │
│  └──────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      Storage Layer                               │
│  ┌────────────────────────┐  ┌────────────────────────────────┐ │
│  │  LocalStorageAdapter   │  │    SupabaseStorageAdapter      │ │
│  │      (Default)         │  │        (Optional)              │ │
│  └────────────────────────┘  └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        API Layer                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              /api/chat (POST)                            │   │
│  │         AI SDK streamText + OpenAI                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## File Structure

```
aimo-chat/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # Streaming chat endpoint
│   ├── chat/
│   │   └── [id]/
│   │       └── page.tsx          # Session-specific page
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Main chat page
├── components/
│   └── chat/
│       ├── ChatInterface.tsx     # Main chat UI
│       ├── ChatModelSelector.tsx # Model dropdown
│       ├── ChatSidebar.tsx       # Session list
│       └── index.ts              # Barrel export
├── config/
│   ├── defaults.ts               # Default settings
│   ├── models.ts                 # Model definitions
│   └── providers.ts              # Provider config
├── hooks/
│   └── chat/
│       ├── index.ts              # Barrel export
│       ├── useChatMessages.ts    # AI SDK integration
│       ├── useModels.ts          # Model selection
│       └── useSessions.ts        # Session management
├── lib/
│   ├── storage/
│   │   ├── index.ts              # Adapter factory
│   │   ├── localStorage.ts       # LocalStorage adapter
│   │   └── supabase.ts           # Supabase adapter
│   └── supabase/
│       ├── client.ts             # Browser client
│       ├── server.ts             # Server client
│       └── types.ts              # Database types
├── store/
│   ├── chatStore.ts              # Chat UI state
│   ├── modelStore.ts             # Model selection
│   └── sessionStore.ts           # Current session
├── types/
│   ├── chat.ts                   # Chat types
│   ├── models.ts                 # Model types
│   └── storage.ts                # Storage interface
└── docs/
    └── IMPLEMENTATION_SUMMARY.md # This file
```

## Key Components

### 1. Types (`types/`)

#### `chat.ts`
- `AppUIMessage`: Extended UIMessage with createdAt and model metadata
- `ChatSession`: Session with id, title, modelId, timestamps
- `PersistedMessage`: Serializable message format for storage
- Conversion helpers: `toUIMessage()`, `toPersistedMessage()`, `toSession()`

#### `models.ts`
- `ModelDefinition`: Model config (id, name, provider, capabilities)
- `ProviderConfig`: Provider settings (name, baseUrl, apiKeyEnv)
- `ModelState`: Zustand store state interface

#### `storage.ts`
- `StorageAdapter`: Interface for storage implementations
  - Session operations: getSessions, getSession, createSession, updateSession, deleteSession
  - Message operations: getMessages, addMessage, updateMessage, deleteMessage

### 2. Configuration (`config/`)

#### `models.ts`
```typescript
export const OPENAI_MODELS: ModelDefinition[] = [
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", ... },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", ... },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "openai", ... },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "openai", ... },
];
```

#### `defaults.ts`
```typescript
export const DEFAULT_MODEL_ID = "gpt-4o";
export const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant...";
export const MAX_LOCAL_SESSIONS = 50;
export const STORAGE_KEYS = {
  SESSIONS: "aimo-chat-sessions",
  MESSAGES_PREFIX: "aimo-chat-messages-",
  SELECTED_MODEL: "aimo-chat-model",
  CURRENT_SESSION: "aimo-chat-current-session",
};
```

### 3. Storage Layer (`lib/storage/`)

#### Storage Adapter Pattern
```typescript
interface StorageAdapter {
  readonly type: "local" | "supabase";

  // Session operations
  getSessions(): Promise<ChatSession[]>;
  getSession(id: string): Promise<ChatSession | null>;
  createSession(session: Omit<ChatSession, "id" | "createdAt" | "updatedAt">): Promise<ChatSession>;
  updateSession(id: string, updates: Partial<Pick<ChatSession, "title" | "modelId">>): Promise<void>;
  deleteSession(id: string): Promise<void>;

  // Message operations
  getMessages(sessionId: string): Promise<PersistedMessage[]>;
  addMessage(sessionId: string, message: AppUIMessage, model?: string): Promise<void>;
  updateMessage(sessionId: string, messageId: string, data: Partial<...>): Promise<void>;
  deleteMessage(sessionId: string, messageId: string): Promise<void>;
}
```

#### Adapter Selection
```typescript
// lib/storage/index.ts
export function getStorageAdapter(): StorageAdapter {
  if (isSupabaseConfigured()) {
    return new SupabaseStorageAdapter();
  }
  return new LocalStorageAdapter();
}
```

### 4. State Management (`store/`)

All stores use Zustand with localStorage persistence:

#### `sessionStore.ts`
```typescript
interface SessionState {
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
}
```

#### `modelStore.ts`
```typescript
interface ModelState {
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
}
```

#### `chatStore.ts`
```typescript
interface ChatState {
  isGenerating: boolean;
  error: string | null;
  setIsGenerating: (value: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}
```

### 5. Hooks (`hooks/chat/`)

#### `useChatMessages.ts` - AI SDK v6 Integration
```typescript
// Uses the new transport-based architecture
const transport = useMemo(
  () => new TextStreamChatTransport({
    api: "/api/chat",
    body: { model: selectedModelId, sessionId },
  }),
  [selectedModelId, sessionId]
);

const { messages, status, sendMessage, stop, regenerate } = useAIChat({
  id: sessionId ?? undefined,
  messages: initialMessages,
  transport,
  onFinish: async ({ message }) => {
    // Persist assistant message
  },
});
```

#### `useSessions.ts`
```typescript
interface UseSessionsReturn {
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  isLoading: boolean;
  createSession: () => Promise<ChatSession>;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => Promise<void>;
}
```

#### `useModels.ts`
```typescript
interface UseModelsReturn {
  models: ModelDefinition[];
  selectedModel: ModelDefinition;
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
}
```

### 6. API Route (`app/api/chat/route.ts`)

```typescript
export async function POST(request: Request) {
  const { messages, model = DEFAULT_MODEL_ID } = await request.json();

  // Add system message if not present
  const messagesWithSystem = hasSystemMessage
    ? messages
    : [{ role: "system", content: DEFAULT_SYSTEM_PROMPT }, ...messages];

  const result = await streamText({
    model: openai(model),
    messages: messagesWithSystem,
  });

  return result.toTextStreamResponse();
}
```

### 7. UI Components (`components/chat/`)

#### `ChatInterface.tsx`
- Main chat view with message list and input
- Uses `useChatMessages` hook for AI interaction
- Integrates `PromptInput` component with attachments support
- Renders messages with `Streamdown` for markdown streaming

#### `ChatSidebar.tsx`
- Session list with create/delete functionality
- Highlights current active session
- Uses `useSessions` hook

#### `ChatModelSelector.tsx`
- Dropdown for model selection
- Uses `useModels` hook

## AI SDK v6 Migration Notes

### Breaking Changes Addressed

1. **Transport-based Architecture**
   - Old: `api: "/api/chat"` option
   - New: `TextStreamChatTransport` class
   ```typescript
   const transport = new TextStreamChatTransport({
     api: "/api/chat",
     body: { model, sessionId },
   });
   ```

2. **Message Format**
   - Old: `message.content` (string)
   - New: `message.parts` (array of parts)
   ```typescript
   const textContent = message.parts
     ?.filter((part) => part.type === "text")
     .map((part) => part.text)
     .join("");
   ```

3. **sendMessage Signature**
   - Old: `append({ role: "user", content: text })`
   - New: `sendMessage({ parts: [{ type: "text", text }] })`

4. **onFinish Callback**
   - Old: `onFinish: (message) => {}`
   - New: `onFinish: ({ message }) => {}`

5. **Stream Response**
   - Old: `toDataStreamResponse()`
   - New: `toTextStreamResponse()`

## Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...

# Optional (for Supabase storage)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## Database Schema (Supabase)

```sql
-- Sessions table
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  model_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  parts JSONB,
  attachments JSONB,
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster message retrieval
CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
```

## Future Improvements

1. **Additional Providers**: Add Anthropic, Google, and other providers
2. **API Key UI**: Settings dialog for runtime API key configuration
3. **Message Editing**: Support for editing sent messages
4. **Branching**: Support for conversation branching/regeneration
5. **Export/Import**: Session export and import functionality
6. **Search**: Full-text search across sessions
7. **Attachments**: File upload and image support
8. **Streaming Indicators**: Better loading states and typing indicators

## Dependencies

```json
{
  "@ai-sdk/openai": "^1.x",
  "@ai-sdk/react": "^1.x",
  "ai": "^5.x",
  "@supabase/supabase-js": "^2.87.x",
  "zustand": "^5.x",
  "streamdown": "^x.x"
}
```

## Running the Application

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your OPENAI_API_KEY

# Development
pnpm dev

# Build
pnpm build

# Start production
pnpm start
```
