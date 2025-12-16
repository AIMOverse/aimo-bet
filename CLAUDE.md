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
- **AI Integration**: Vercel AI SDK (`ai` package v6, `@ai-sdk/openai`, `@ai-sdk/mcp`)
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
│   ├── store/
│   │   ├── page.tsx             # Store listing (models, agents, tools)
│   │   └── [id]/
│   │       └── page.tsx         # Service detail page
│   └── api/
│       ├── chat/
│       │   └── route.ts         # Chat API with tool execution
│       ├── models/
│       │   └── route.ts         # Models registry proxy
│       ├── agents/
│       │   └── route.ts         # Agents registry proxy
│       └── tools/
│           └── route.ts         # Tools registry proxy
├── components/
│   ├── ui/                      # shadcn/ui primitives
│   ├── chat/
│   │   ├── ChatInterface.tsx    # Main chat container
│   │   ├── ChatSidebar.tsx      # Session history sidebar
│   │   ├── ChatModelSelector.tsx    # Model selection dropdown
│   │   ├── ChatAgentSelector.tsx    # Agent selection dropdown
│   │   └── ChatToolSelector.tsx     # Tool selection multi-select
│   ├── store/
│   │   ├── StoreList.tsx        # Services grid/list view
│   │   ├── StoreHeader.tsx      # Search and filters
│   │   └── ServiceDetail.tsx    # Detail view for model/agent/tool
│   └── ai-elements/
│       ├── message.tsx          # Message bubble component
│       ├── prompt-input.tsx     # Chat input with attachments
│       ├── tool.tsx             # Tool call/result display
│       ├── confirmation.tsx     # Tool approval UI
│       └── ...                  # Other message renderers
├── config/
│   ├── models.ts                # Default model definitions
│   ├── agents.ts                # Default agent definitions
│   ├── tools.ts                 # Built-in tool definitions
│   ├── providers.ts             # API provider configurations
│   └── defaults.ts              # Default settings
├── hooks/
│   ├── chat/
│   │   ├── useChatMessages.ts   # Chat logic hook (AI SDK wrapper)
│   │   ├── useSessions.ts       # Session management
│   │   ├── useModels.ts         # Model fetching/selection
│   │   ├── useAgents.ts         # Agent fetching/selection
│   │   └── useTools.ts          # Tool fetching/selection
│   └── store/
│       ├── useHydration.ts      # Zustand hydration helper
│       └── useServiceLists.ts   # Fetch models, agents, tools
├── lib/
│   ├── mcp/
│   │   └── client.ts            # MCP client factory (AI SDK based)
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
│   ├── modelStore.ts            # Selected model state
│   ├── agentStore.ts            # Selected agent state
│   └── toolStore.ts             # Enabled tools state
├── types/
│   ├── chat.ts                  # Message, Session types
│   ├── models.ts                # Model definitions
│   ├── agents.ts                # Agent types (A2A protocol)
│   ├── tools.ts                 # Tool types (MCP)
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

# Required: AiMo Network API Key (or OpenAI-compatible key)
OPENAI_API_KEY=sk-...

# Optional: Default model (defaults to openai/gpt-4o)
# DEFAULT_MODEL=openai/gpt-4o

# Optional: Supabase (for cloud storage)
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Optional: Storage mode ("local" | "supabase", defaults to "local")
# NEXT_PUBLIC_STORAGE_MODE=local

# Optional: Local MCP servers (for power users)
# MCP_MEMORY_SERVER_URL=http://localhost:3001/mcp
# MCP_MEMORY_SERVER_COMMAND=node
# MCP_MEMORY_SERVER_ARGS=./mcp-server/dist/index.js
```

## Architecture Decisions

### No Authentication (V1/V2)

The app has no user accounts or authentication. This is intentional:

- Simpler setup (just add API key via env and go)
- No backend dependencies for basic usage
- Privacy-friendly (all data stays local by default)

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

Storage mode is determined by `NEXT_PUBLIC_STORAGE_MODE` environment variable.

### API Proxy Pattern

All requests go through Next.js API routes:

```
Browser → /api/chat    → AiMo Network → Streaming Response
Browser → /api/models  → AiMo Network → Models List
Browser → /api/agents  → AiMo Network → Agents List
Browser → /api/tools   → AiMo Network → Tools List
```

- Keeps API keys server-side (more secure)
- Enables rate limiting and logging
- Tool execution happens server-side

### Hybrid Data Sources

Models, agents, and tools support both static config and API fetching:

```typescript
// Static defaults in config/
export const DEFAULT_MODELS = [...];
export const DEFAULT_AGENTS = [...];
export const BUILT_IN_TOOLS = {...};

// Merged with API data at runtime
const models = [...DEFAULT_MODELS, ...apiModels];
```

### Tool System Architecture

Three-tier tool system:

```
┌─────────────────────────────────────────────────────────────┐
│  1. Built-in Tools (AI SDK tools)                           │
│     - Defined in config/tools.ts                            │
│     - Full type safety, same-process execution              │
│     - Always available                                      │
├─────────────────────────────────────────────────────────────┤
│  2. Local MCP Servers (env-configured)                      │
│     - Connect via stdio or HTTP transport                   │
│     - For power users with local MCP servers                │
│     - Configured via MCP_* environment variables            │
├─────────────────────────────────────────────────────────────┤
│  3. AiMo Network Tools (from /api/tools registry)           │
│     - Each tool has an MCP endpoint                         │
│     - Connected on-demand when enabled                      │
│     - Pricing and capability info from registry             │
└─────────────────────────────────────────────────────────────┘
```

**Tool Execution**: Server-side only (in `/api/chat` route)
- Tools execute on the server, not in the browser
- MCP clients created per-request, closed after response
- More secure (no client-side API key exposure)

**Tool Selection Persistence**: Global defaults + per-session overrides
- Global tool preferences stored in `toolStore` (persisted)
- Per-session tool overrides stored with session data
- Session inherits global defaults, can override

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
export const useToolStore = create<ToolState>()(
  persist(
    (set, get) => ({
      enabledTools: [],
      globalToolDefaults: [],
      setEnabledTools: (tools) => set({ enabledTools: tools }),
      toggleTool: (toolId) => {
        const current = get().enabledTools;
        const updated = current.includes(toolId)
          ? current.filter((id) => id !== toolId)
          : [...current, toolId];
        set({ enabledTools: updated });
      },
    }),
    { name: "aimo-chat-tools" }
  )
);
```

---

## Migration Plan (from aimo-web-app)

### Phase 1: Core Infrastructure ✅ COMPLETE

Basic chat functionality with models:
- Types, config, storage adapters
- Session management
- Model selection
- Chat API route

### Phase 2: Store, Agents, Tools, MCP ✅ COMPLETE

#### 2.1 Types (`types/`)

**`types/agents.ts`** - Agent types from aimo-web-app:
```typescript
// Core types to migrate (simplified, no auth fields):
export interface AgentCatalogItem {
  agent_id: string;
  name: string;
  description?: string;
  image?: string;
  agent_wallet_address: string;
  chat_completion?: {
    endpoint: string;
    pricing?: { per_million_tokens: number };
  };
  created_at: string;
  updated_at: string;
}

export interface A2ACapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
}

export interface A2ASkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  examples?: string[];
}

export interface A2ACard {
  name: string;
  description?: string;
  url?: string;
  version?: string;
  capabilities: A2ACapabilities;
  skills: A2ASkill[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
}

export interface AgentCatalogItemWithA2A extends AgentCatalogItem {
  a2a_card?: A2ACard;
}
```

**`types/tools.ts`** - Tool types from aimo-web-app:
```typescript
export interface MCPCapabilities {
  tools?: boolean;
  prompts?: boolean;
  resources?: boolean;
}

export interface MCPToolPricing {
  per_call?: number;
  currency?: string;
}

export interface MCPToolMetadata {
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
  documentation_url?: string;
}

export interface MCPToolInfo {
  agent_id: string;
  agent_name: string;
  agent_wallet_address?: string;
  endpoint: string;
  routing_key?: string;
  capabilities?: MCPCapabilities;
  pricing?: MCPToolPricing;
  metadata?: MCPToolMetadata;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

// For built-in tools (AI SDK tool format)
export interface BuiltInToolConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
}
```

#### 2.2 Config (`config/`)

**`config/agents.ts`** - Default agent definitions:
```typescript
import type { AgentCatalogItemWithA2A } from "@/types/agents";

export const DEFAULT_AGENTS: AgentCatalogItemWithA2A[] = [
  // Static fallback agents (if API unavailable)
];
```

**`config/tools.ts`** - Built-in AI SDK tools:
```typescript
import { tool } from "ai";
import { z } from "zod";

// Built-in tools that execute server-side
export const BUILT_IN_TOOLS = {
  // Example: calculator tool
  calculator: tool({
    description: "Perform mathematical calculations",
    inputSchema: z.object({
      expression: z.string().describe("Mathematical expression to evaluate"),
    }),
    execute: async ({ expression }) => {
      // Safe math evaluation (use mathjs or similar)
      return { result: "..." };
    },
  }),
} as const;

export const BUILT_IN_TOOL_CONFIGS: BuiltInToolConfig[] = [
  {
    id: "calculator",
    name: "Calculator",
    description: "Perform mathematical calculations",
    category: "utilities",
    enabled: true,
  },
];
```

#### 2.3 Stores (`store/`)

**`store/agentStore.ts`**:
```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AgentState {
  selectedAgentId: string | null;
  setSelectedAgent: (agentId: string | null) => void;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      selectedAgentId: null,
      setSelectedAgent: (agentId) => set({ selectedAgentId: agentId }),
    }),
    { name: "aimo-chat-agent" }
  )
);
```

**`store/toolStore.ts`**:
```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ToolState {
  // Global defaults (persisted)
  globalEnabledTools: string[];
  // Per-session overrides (not persisted here, stored with session)
  setGlobalEnabledTools: (toolIds: string[]) => void;
  toggleGlobalTool: (toolId: string) => void;
}

export const useToolStore = create<ToolState>()(
  persist(
    (set, get) => ({
      globalEnabledTools: [],
      setGlobalEnabledTools: (toolIds) => set({ globalEnabledTools: toolIds }),
      toggleGlobalTool: (toolId) => {
        const current = get().globalEnabledTools;
        const updated = current.includes(toolId)
          ? current.filter((id) => id !== toolId)
          : [...current, toolId];
        set({ globalEnabledTools: updated });
      },
    }),
    { name: "aimo-chat-tools" }
  )
);
```

#### 2.4 Hooks (`hooks/chat/`)

**`hooks/chat/useAgents.ts`**:
```typescript
import useSWR from "swr";
import { DEFAULT_AGENTS } from "@/config/agents";
import type { AgentCatalogItemWithA2A } from "@/types/agents";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useAgents() {
  const { data, error, isLoading } = useSWR<{ data: AgentCatalogItemWithA2A[] }>(
    "/api/agents",
    fetcher,
    { fallbackData: { data: DEFAULT_AGENTS } }
  );

  return {
    agents: data?.data ?? DEFAULT_AGENTS,
    isLoading,
    error,
  };
}
```

**`hooks/chat/useTools.ts`**:
```typescript
import useSWR from "swr";
import { BUILT_IN_TOOL_CONFIGS } from "@/config/tools";
import type { MCPToolInfo, BuiltInToolConfig } from "@/types/tools";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useTools() {
  const { data, error, isLoading } = useSWR<{ data: MCPToolInfo[] }>(
    "/api/tools",
    fetcher,
    { fallbackData: { data: [] } }
  );

  return {
    // Network tools from registry
    networkTools: data?.data ?? [],
    // Built-in tools (always available)
    builtInTools: BUILT_IN_TOOL_CONFIGS,
    // Combined list for UI
    allTools: [
      ...BUILT_IN_TOOL_CONFIGS.map((t) => ({ ...t, source: "builtin" as const })),
      ...(data?.data ?? []).map((t) => ({ ...t, source: "network" as const })),
    ],
    isLoading,
    error,
  };
}
```

#### 2.5 API Routes (`app/api/`)

**`app/api/agents/route.ts`**:
```typescript
import { NextResponse } from "next/server";

const AIMO_BASE_URL = "https://devnet.aimo.network/api/v1";

export async function GET() {
  try {
    const response = await fetch(`${AIMO_BASE_URL}/agents`, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch agents: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Agents API error:", error);
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}
```

**`app/api/tools/route.ts`**:
```typescript
import { NextResponse } from "next/server";

const AIMO_BASE_URL = "https://devnet.aimo.network/api/v1";

export async function GET() {
  try {
    const response = await fetch(`${AIMO_BASE_URL}/tools`, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tools: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Tools API error:", error);
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}
```

#### 2.6 Enhanced Chat Route (`app/api/chat/route.ts`)

```typescript
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, UIMessage, tool, ToolSet } from "ai";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { BUILT_IN_TOOLS } from "@/config/tools";

const AIMO_BASE_URL = "https://devnet.aimo.network/api/v1";

export const maxDuration = 60;

interface ChatRequest {
  messages: UIMessage[];
  model?: string;
  enabledTools?: string[];      // Tool IDs to enable
  sessionToolOverrides?: string[]; // Per-session overrides (optional)
}

export async function POST(req: Request) {
  const {
    messages,
    model = "openai/gpt-4o",
    enabledTools = [],
  }: ChatRequest = await req.json();

  // 1. Start with built-in tools that are enabled
  const tools: ToolSet = {};
  const mcpClients: Array<{ close: () => Promise<void> }> = [];

  // Add enabled built-in tools
  for (const toolId of enabledTools) {
    if (toolId in BUILT_IN_TOOLS) {
      tools[toolId] = BUILT_IN_TOOLS[toolId as keyof typeof BUILT_IN_TOOLS];
    }
  }

  // 2. Connect to enabled network tools (MCP endpoints)
  // Fetch tool info from cache/registry for MCP endpoints
  const networkToolIds = enabledTools.filter((id) => !(id in BUILT_IN_TOOLS));

  for (const toolId of networkToolIds) {
    try {
      // Fetch tool endpoint info (could cache this)
      const toolInfo = await getToolEndpoint(toolId);
      if (toolInfo?.endpoint) {
        const mcpClient = await createMCPClient({
          transport: {
            type: "http",
            url: toolInfo.endpoint,
          },
        });
        mcpClients.push(mcpClient);
        const mcpTools = await mcpClient.tools();
        Object.assign(tools, mcpTools);
      }
    } catch (error) {
      console.error(`Failed to connect to MCP tool ${toolId}:`, error);
    }
  }

  // 3. Create model client and stream
  const aimo = createOpenAI({
    baseURL: AIMO_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY,
  });

  const result = streamText({
    model: aimo.chat(model),
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    messages: toSimpleMessages(messages),
    onFinish: async () => {
      // Close all MCP clients
      await Promise.all(mcpClients.map((c) => c.close()));
    },
  });

  return result.toUIMessageStreamResponse();
}

async function getToolEndpoint(toolId: string) {
  // Fetch from tools registry or cache
  const response = await fetch(`${AIMO_BASE_URL}/tools`);
  const { data } = await response.json();
  return data.find((t: any) => t.agent_id === toolId);
}
```

#### 2.7 MCP Client Factory (`lib/mcp/client.ts`)

```typescript
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";

export interface MCPServerConfig {
  type: "http" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
}

export async function connectToMCPServer(config: MCPServerConfig) {
  if (config.type === "http" && config.url) {
    return createMCPClient({
      transport: {
        type: "http",
        url: config.url,
        headers: config.headers,
      },
    });
  }

  if (config.type === "stdio" && config.command) {
    // Import stdio transport only when needed (server-side only)
    const { Experimental_StdioMCPTransport } = await import("@ai-sdk/mcp/mcp-stdio");
    return createMCPClient({
      transport: new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args || [],
      }),
    });
  }

  throw new Error("Invalid MCP server configuration");
}

// Get local MCP server config from environment
export function getLocalMCPConfig(): MCPServerConfig | null {
  const url = process.env.MCP_MEMORY_SERVER_URL;
  const command = process.env.MCP_MEMORY_SERVER_COMMAND;

  if (url) {
    return { type: "http", url };
  }

  if (command) {
    return {
      type: "stdio",
      command,
      args: process.env.MCP_MEMORY_SERVER_ARGS?.split(" "),
    };
  }

  return null;
}
```

#### 2.8 Store Page (`app/store/`)

**`app/store/page.tsx`** - Services listing:
```typescript
"use client";

import { useState } from "react";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreList } from "@/components/store/StoreList";
import { useServiceLists } from "@/hooks/store/useServiceLists";

type Tab = "model" | "agent" | "tool";
type ViewMode = "grid" | "list";

export default function StorePage() {
  const [activeTab, setActiveTab] = useState<Tab>("model");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");

  const { models, agents, tools, isLoading } = useServiceLists();

  return (
    <div className="container py-6">
      <StoreHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
      />
      <StoreList
        activeTab={activeTab}
        viewMode={viewMode}
        search={search}
        models={models}
        agents={agents}
        tools={tools}
        isLoading={isLoading}
      />
    </div>
  );
}
```

**`app/store/[id]/page.tsx`** - Service detail:
```typescript
// Detail view for model, agent, or tool
// Query param ?type=model|agent|tool determines which
```

#### 2.9 UI Components (`components/chat/`)

**`components/chat/ChatToolSelector.tsx`**:
```typescript
"use client";

import { memo } from "react";
import { useTools } from "@/hooks/chat/useTools";
import { useToolStore } from "@/store/toolStore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WrenchIcon } from "lucide-react";

export const ChatToolSelector = memo(function ChatToolSelector() {
  const { allTools, isLoading } = useTools();
  const { globalEnabledTools, toggleGlobalTool } = useToolStore();

  const enabledCount = globalEnabledTools.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <WrenchIcon className="h-4 w-4" />
          {enabledCount > 0 && (
            <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5">
              {enabledCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Tools</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {allTools.map((tool) => (
          <DropdownMenuCheckboxItem
            key={tool.id || tool.agent_id}
            checked={globalEnabledTools.includes(tool.id || tool.agent_id)}
            onCheckedChange={() => toggleGlobalTool(tool.id || tool.agent_id)}
          >
            <div className="flex flex-col">
              <span>{tool.name || tool.agent_name}</span>
              {tool.description && (
                <span className="text-xs text-muted-foreground truncate">
                  {tool.description}
                </span>
              )}
            </div>
          </DropdownMenuCheckboxItem>
        ))}
        {allTools.length === 0 && !isLoading && (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No tools available
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
```

**`components/chat/ChatAgentSelector.tsx`**:
```typescript
// Similar pattern to ChatToolSelector but for agent selection
// Single-select dropdown instead of multi-select
```

---

### Files to Migrate from aimo-web-app

**Migrate & Adapt:**
- `src/types/api/agents.ts` → `types/agents.ts` (simplify, remove auth)
- `src/types/api/tools.ts` → `types/tools.ts` (simplify)
- `src/hooks/marketplace/useServiceLists.ts` → `hooks/store/useServiceLists.ts` (remove auth)
- `src/components/marketplace/Store/StorePage.tsx` → `components/store/` (simplify)
- `src/components/marketplace/Store/StoreList.tsx` → `components/store/StoreList.tsx`
- `src/store/toolSelectionStore.ts` → `store/toolStore.ts` (simplify)
- `src/store/agentSelectionStore.ts` → `store/agentStore.ts` (simplify)

**NOT Migrating:**
- All wallet/auth code
- Provider pages (`/marketplace/provider/`)
- Account management
- AIMO-specific analytics
- Referral system
- Landing page
- Complex filter system (simplified version only)

---

## Supabase Schema

For Supabase storage mode, the following tables are needed:

```sql
-- Chat sessions (no user_id, anonymous usage)
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New Chat',
  model_id text not null,
  agent_id text,                           -- Selected agent (optional)
  enabled_tools text[] default '{}',       -- Per-session tool overrides
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chat messages
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  tool_calls jsonb default '[]',           -- Tool calls made
  tool_results jsonb default '[]',         -- Tool results received
  attachments jsonb default '[]',
  created_at timestamptz default now()
);

-- Indexes
create index idx_messages_session on chat_messages(session_id);
create index idx_sessions_updated on chat_sessions(updated_at desc);
```

---

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
# Edit .env.local with your API key
pnpm install
pnpm build
pnpm start
```

---

## Roadmap

### V1 ✅ COMPLETE
- [x] Basic chat interface with AiMo Network
- [x] Model selection (fetched from registry)
- [x] Session management (localStorage)
- [x] Optional Supabase storage backend
- [x] Markdown rendering
- [x] Code syntax highlighting
- [x] Dark/light theme

### V2 ✅ COMPLETE
- [x] Store page (models, agents, tools listing)
- [x] Agent selection in chat
- [x] Tool selection in chat (multi-select)
- [x] Built-in AI SDK tools (time, UUID, base64, URL encode, JSON format)
- [x] MCP tool support (network + local via @ai-sdk/mcp)
- [x] Store link in sidebar

### V3 (CURRENT)
- [ ] Per-session tool overrides UI
- [ ] Tool call/result UI display
- [ ] Multi-modal (images, vision)
- [ ] File attachments with storage
- [ ] Custom MCP server UI configuration
- [ ] Export/import sessions
- [ ] Tool approval workflow (for sensitive tools)
