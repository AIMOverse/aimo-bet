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
│   ├── page.tsx                 # Main chat interface (redirects to new session)
│   ├── layout.tsx               # Root layout with providers + AppSidebar
│   ├── chat/
│   │   └── [id]/
│   │       └── page.tsx         # Session-specific chat page
│   ├── store/
│   │   ├── page.tsx             # Store listing (models, agents, tools)
│   │   └── [id]/
│   │       └── page.tsx         # StoreItem detail page (unified)
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
│   ├── layout/
│   │   └── AppSidebar.tsx       # Full sidebar (sessions, nav, footer)
│   ├── chat/
│   │   ├── ChatInterface.tsx    # Main chat container (with header)
│   │   ├── ChatModelSelector.tsx    # Model selection dropdown
│   │   ├── ChatAgentSelector.tsx    # Agent selection dropdown
│   │   └── ChatToolSelector.tsx     # Tool selection multi-select
│   ├── store/
│   │   ├── StoreHeader.tsx      # Tabs, search, filters, view toggle
│   │   ├── StoreList.tsx        # Services grid/list view
│   │   ├── StoreItem.tsx        # Unified detail view component
│   │   └── filters/
│   │       ├── FilterPopover.tsx    # Reusable filter popover
│   │       ├── ProviderFilter.tsx   # Provider multi-select filter
│   │       └── CategoryFilter.tsx   # Category filter
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
│       ├── useServiceLists.ts   # Fetch models, agents, tools
│       └── useStoreFilters.ts   # Filter state management
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
│   ├── toolStore.ts             # Enabled tools state
│   └── storeFiltersStore.ts     # Store page filter state
├── types/
│   ├── chat.ts                  # Message, Session types
│   ├── models.ts                # Model definitions
│   ├── agents.ts                # Agent types (A2A protocol)
│   ├── tools.ts                 # Tool types (MCP)
│   ├── filters.ts               # Store filter types
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

## Phase 3: UI Refactoring (CURRENT)

Refactor UI to match aimo-web-app patterns: full sidebar, integrated chat header, unified store item page, and filters.

### 3.1 AppSidebar (Full Sidebar)

**Reference**: `aimo-web-app/src/components/layout/app/userMode/UserSidebar.tsx`

Create a full sidebar using shadcn/ui `<Sidebar>` components that includes:
- Session history list (from current ChatSidebar)
- Navigation items (Chat, Store)
- Collapsible sections
- Mobile-responsive with `SidebarTrigger`

#### New Files

**`components/layout/AppSidebar.tsx`**:
```typescript
"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  Store,
  Plus,
  Trash2,
  Settings,
} from "lucide-react";
import { useSessions } from "@/hooks/chat/useSessions";
import { useSessionStore } from "@/store/sessionStore";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { id: "chat", label: "Chat", icon: MessageSquare, href: "/" },
  { id: "store", label: "Store", icon: Store, href: "/store" },
];

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const { sessions, createSession, deleteSession } = useSessions();
  const { currentSessionId, setCurrentSession } = useSessionStore();

  const handleNewChat = async () => {
    const session = await createSession();
    if (session) {
      setCurrentSession(session.id);
      router.push(`/chat/${session.id}`);
      if (isMobile) setOpenMobile(false);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    setCurrentSession(sessionId);
    router.push(`/chat/${sessionId}`);
    if (isMobile) setOpenMobile(false);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await deleteSession(sessionId);
    if (currentSessionId === sessionId) {
      router.push("/");
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        <div className="flex items-center justify-between px-2 py-2">
          <span className="font-semibold text-lg">AiMo Chat</span>
          <Button variant="ghost" size="icon" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                  >
                    <a href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Sessions */}
        <SidebarGroup className="flex-1">
          <SidebarGroupLabel>Sessions</SidebarGroupLabel>
          <SidebarGroupContent>
            <ScrollArea className="h-[calc(100vh-280px)]">
              <SidebarMenu>
                {sessions.map((session) => (
                  <SidebarMenuItem key={session.id}>
                    <SidebarMenuButton
                      onClick={() => handleSelectSession(session.id)}
                      isActive={currentSessionId === session.id}
                      className="group"
                    >
                      <MessageSquare className="h-4 w-4 shrink-0" />
                      <span className="truncate">{session.title}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
                {sessions.length === 0 && (
                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                    No sessions yet
                  </div>
                )}
              </SidebarMenu>
            </ScrollArea>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
```

#### Modified Files

**`app/layout.tsx`** - Wrap with SidebarProvider:
```typescript
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            {children}
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}
```

#### shadcn/ui Sidebar Components Required

Ensure these sidebar primitives exist in `components/ui/sidebar.tsx`:
- `Sidebar`, `SidebarProvider`, `SidebarInset`
- `SidebarHeader`, `SidebarContent`, `SidebarFooter`
- `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent`
- `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarMenuAction`
- `SidebarTrigger`, `useSidebar` hook

Reference: https://ui.shadcn.com/docs/components/sidebar

---

### 3.2 ChatInterface with Integrated Header

**Reference**: `aimo-web-app/src/components/chat/ChatInterface.tsx`

Update ChatInterface to include a header section with:
- `SidebarTrigger` (for mobile)
- Session title (editable or display)
- Model selector (move from prompt footer if desired)

#### Modified Files

**`components/chat/ChatInterface.tsx`**:
```typescript
"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { useSessions } from "@/hooks/chat/useSessions";
import { useSessionStore } from "@/store/sessionStore";
import { ChatModelSelector } from "./ChatModelSelector";
// ... existing imports

interface ChatInterfaceProps {
  sessionId?: string;
}

export function ChatInterface({ sessionId }: ChatInterfaceProps) {
  const { sessions } = useSessions();
  const { currentSessionId } = useSessionStore();

  const activeSessionId = sessionId || currentSessionId;
  const currentSession = sessions.find((s) => s.id === activeSessionId);

  // ... existing chat logic

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-sm font-medium truncate flex-1">
          {currentSession?.title || "New Chat"}
        </h1>
        <ChatModelSelector />
      </header>

      {/* Conversation Area */}
      <div className="flex-1 overflow-hidden">
        <Conversation>
          {/* ... existing conversation content */}
        </Conversation>
      </div>

      {/* Prompt Input */}
      <div className="border-t p-4">
        <PromptInput>
          {/* ... existing prompt input with tools/agent selectors */}
        </PromptInput>
      </div>
    </div>
  );
}
```

---

### 3.3 StoreItem (Unified Detail Page)

**Reference**: `aimo-web-app/src/components/marketplace/Service/ServicePage.tsx`

Create a single `StoreItem` component that handles all three types (model, agent, tool) based on query params or route.

#### New Files

**`components/store/StoreItem.tsx`**:
```typescript
"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useServiceLists } from "@/hooks/store/useServiceLists";
import { useModelStore } from "@/store/modelStore";
import { useAgentStore } from "@/store/agentStore";
import { useToolStore } from "@/store/toolStore";

interface StoreItemProps {
  id: string;
}

export function StoreItem({ id }: StoreItemProps) {
  const searchParams = useSearchParams();
  const type = searchParams.get("type") as "model" | "agent" | "tool" | null;

  const { models, agents, tools, isLoading } = useServiceLists();
  const { selectedModelId, setSelectedModel } = useModelStore();
  const { selectedAgentId, setSelectedAgent } = useAgentStore();
  const { globalEnabledTools, toggleGlobalTool } = useToolStore();

  // Find the item based on type
  const item = type === "model"
    ? models.find((m) => m.id === id)
    : type === "agent"
    ? agents.find((a) => a.agent_id === id)
    : type === "tool"
    ? tools.find((t) => t.agent_id === id || t.id === id)
    : null;

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!item || !type) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Item not found</p>
        <Link href="/store">
          <Button variant="link" className="px-0">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Store
          </Button>
        </Link>
      </div>
    );
  }

  // Render based on type
  return (
    <div className="container max-w-4xl py-6">
      <Link href="/store">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Store
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">
                {type === "model" && item.name}
                {type === "agent" && item.name}
                {type === "tool" && (item.name || item.agent_name)}
              </CardTitle>
              <CardDescription className="mt-2">
                {type === "model" && item.description}
                {type === "agent" && item.description}
                {type === "tool" && item.description}
              </CardDescription>
            </div>
            <Badge variant="outline">{type}</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Model-specific fields */}
          {type === "model" && (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Provider</span>
                  <p className="font-medium">{item.provider}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Context Length</span>
                  <p className="font-medium">{item.contextLength?.toLocaleString()} tokens</p>
                </div>
                {item.pricing && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Input Price</span>
                      <p className="font-medium">${item.pricing.input}/1M tokens</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Output Price</span>
                      <p className="font-medium">${item.pricing.output}/1M tokens</p>
                    </div>
                  </>
                )}
              </div>
              <Separator />
              <Button
                onClick={() => setSelectedModel(item.id)}
                disabled={selectedModelId === item.id}
              >
                {selectedModelId === item.id ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Selected
                  </>
                ) : (
                  "Select Model"
                )}
              </Button>
            </>
          )}

          {/* Agent-specific fields */}
          {type === "agent" && (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {item.a2a_card?.capabilities && (
                  <div>
                    <span className="text-muted-foreground">Capabilities</span>
                    <div className="flex gap-1 mt-1">
                      {item.a2a_card.capabilities.streaming && <Badge variant="secondary">Streaming</Badge>}
                      {item.a2a_card.capabilities.pushNotifications && <Badge variant="secondary">Push</Badge>}
                    </div>
                  </div>
                )}
                {item.a2a_card?.skills && (
                  <div>
                    <span className="text-muted-foreground">Skills</span>
                    <p className="font-medium">{item.a2a_card.skills.length} skills</p>
                  </div>
                )}
              </div>
              {item.a2a_card?.skills && item.a2a_card.skills.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2">Skills</h4>
                    <div className="space-y-2">
                      {item.a2a_card.skills.map((skill) => (
                        <div key={skill.id} className="text-sm">
                          <span className="font-medium">{skill.name}</span>
                          {skill.description && (
                            <p className="text-muted-foreground">{skill.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <Separator />
              <Button
                onClick={() => setSelectedAgent(selectedAgentId === item.agent_id ? null : item.agent_id)}
                variant={selectedAgentId === item.agent_id ? "secondary" : "default"}
              >
                {selectedAgentId === item.agent_id ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Selected
                  </>
                ) : (
                  "Select Agent"
                )}
              </Button>
            </>
          )}

          {/* Tool-specific fields */}
          {type === "tool" && (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {item.metadata?.category && (
                  <div>
                    <span className="text-muted-foreground">Category</span>
                    <p className="font-medium">{item.metadata.category}</p>
                  </div>
                )}
                {item.pricing?.per_call && (
                  <div>
                    <span className="text-muted-foreground">Price per Call</span>
                    <p className="font-medium">${item.pricing.per_call}</p>
                  </div>
                )}
                {item.endpoint && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Endpoint</span>
                    <p className="font-medium text-xs font-mono truncate">{item.endpoint}</p>
                  </div>
                )}
              </div>
              {item.metadata?.tags && item.metadata.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {item.metadata.tags.map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              )}
              <Separator />
              {(() => {
                const toolId = item.id || item.agent_id;
                const isEnabled = globalEnabledTools.includes(toolId);
                return (
                  <Button
                    onClick={() => toggleGlobalTool(toolId)}
                    variant={isEnabled ? "secondary" : "default"}
                  >
                    {isEnabled ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Enabled
                      </>
                    ) : (
                      "Enable Tool"
                    )}
                  </Button>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**`app/store/[id]/page.tsx`**:
```typescript
import { StoreItem } from "@/components/store/StoreItem";

interface StoreItemPageProps {
  params: { id: string };
}

export default function StoreItemPage({ params }: StoreItemPageProps) {
  return <StoreItem id={params.id} />;
}
```

---

### 3.4 Store Filters (Search + Provider + Category)

**Reference**: `aimo-web-app/src/components/marketplace/filters/`

Implement a filter system with:
- Search input (existing)
- Provider filter (multi-select popover)
- Category filter (for tools)

#### New Types

**`types/filters.ts`**:
```typescript
export interface StoreFilters {
  search: string;
  providers: string[];
  categories: string[];
  tab: "model" | "agent" | "tool";
}

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}
```

#### New Store

**`store/storeFiltersStore.ts`**:
```typescript
import { create } from "zustand";
import type { StoreFilters } from "@/types/filters";

interface StoreFiltersState extends StoreFilters {
  setSearch: (search: string) => void;
  setProviders: (providers: string[]) => void;
  toggleProvider: (provider: string) => void;
  setCategories: (categories: string[]) => void;
  toggleCategory: (category: string) => void;
  setTab: (tab: StoreFilters["tab"]) => void;
  clearFilters: () => void;
}

const initialState: StoreFilters = {
  search: "",
  providers: [],
  categories: [],
  tab: "model",
};

export const useStoreFiltersStore = create<StoreFiltersState>((set, get) => ({
  ...initialState,
  setSearch: (search) => set({ search }),
  setProviders: (providers) => set({ providers }),
  toggleProvider: (provider) => {
    const current = get().providers;
    const updated = current.includes(provider)
      ? current.filter((p) => p !== provider)
      : [...current, provider];
    set({ providers: updated });
  },
  setCategories: (categories) => set({ categories }),
  toggleCategory: (category) => {
    const current = get().categories;
    const updated = current.includes(category)
      ? current.filter((c) => c !== category)
      : [...current, category];
    set({ categories: updated });
  },
  setTab: (tab) => set({ tab, providers: [], categories: [] }), // Reset filters on tab change
  clearFilters: () => set({ search: "", providers: [], categories: [] }),
}));
```

#### New Filter Components

**`components/store/filters/FilterPopover.tsx`**:
```typescript
"use client";

import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, X } from "lucide-react";
import type { FilterOption } from "@/types/filters";

interface FilterPopoverProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear?: () => void;
}

export function FilterPopover({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: FilterPopoverProps) {
  const hasSelection = selected.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1">
          {label}
          {hasSelection && (
            <Badge variant="secondary" className="ml-1 px-1 min-w-[20px]">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-2 border-b">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{label}</span>
            {hasSelection && onClear && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onClear}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="h-[200px]">
          <div className="p-2 space-y-1">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
              >
                <Checkbox
                  checked={selected.includes(option.value)}
                  onCheckedChange={() => onToggle(option.value)}
                />
                <span className="flex-1 text-sm">{option.label}</span>
                {option.count !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {option.count}
                  </span>
                )}
              </label>
            ))}
            {options.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No options available
              </p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
```

**`components/store/filters/ProviderFilter.tsx`**:
```typescript
"use client";

import { useMemo } from "react";
import { FilterPopover } from "./FilterPopover";
import { useStoreFiltersStore } from "@/store/storeFiltersStore";
import { useServiceLists } from "@/hooks/store/useServiceLists";
import type { FilterOption } from "@/types/filters";

export function ProviderFilter() {
  const { providers, toggleProvider, setProviders } = useStoreFiltersStore();
  const { models } = useServiceLists();

  const options: FilterOption[] = useMemo(() => {
    const providerCounts = new Map<string, number>();
    models.forEach((model) => {
      const provider = model.provider || "Unknown";
      providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
    });
    return Array.from(providerCounts.entries())
      .map(([value, count]) => ({
        value,
        label: value,
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [models]);

  return (
    <FilterPopover
      label="Provider"
      options={options}
      selected={providers}
      onToggle={toggleProvider}
      onClear={() => setProviders([])}
    />
  );
}
```

**`components/store/filters/CategoryFilter.tsx`**:
```typescript
"use client";

import { useMemo } from "react";
import { FilterPopover } from "./FilterPopover";
import { useStoreFiltersStore } from "@/store/storeFiltersStore";
import { useServiceLists } from "@/hooks/store/useServiceLists";
import type { FilterOption } from "@/types/filters";

export function CategoryFilter() {
  const { categories, toggleCategory, setCategories } = useStoreFiltersStore();
  const { tools } = useServiceLists();

  const options: FilterOption[] = useMemo(() => {
    const categoryCounts = new Map<string, number>();
    tools.forEach((tool) => {
      const category = tool.metadata?.category || tool.category || "Uncategorized";
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    });
    return Array.from(categoryCounts.entries())
      .map(([value, count]) => ({
        value,
        label: value,
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tools]);

  return (
    <FilterPopover
      label="Category"
      options={options}
      selected={categories}
      onToggle={toggleCategory}
      onClear={() => setCategories([])}
    />
  );
}
```

#### Modified StoreHeader

**`components/store/StoreHeader.tsx`**:
```typescript
"use client";

import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, X } from "lucide-react";
import { useStoreFiltersStore } from "@/store/storeFiltersStore";
import { ProviderFilter } from "./filters/ProviderFilter";
import { CategoryFilter } from "./filters/CategoryFilter";

interface StoreHeaderProps {
  viewMode: "grid" | "list";
  onViewModeChange: (mode: "grid" | "list") => void;
  counts: { models: number; agents: number; tools: number };
}

export function StoreHeader({ viewMode, onViewModeChange, counts }: StoreHeaderProps) {
  const { search, setSearch, tab, setTab, providers, categories, clearFilters } = useStoreFiltersStore();

  const hasActiveFilters = search || providers.length > 0 || categories.length > 0;

  return (
    <div className="space-y-4 mb-6">
      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="model">
            Models ({counts.models})
          </TabsTrigger>
          <TabsTrigger value="agent">
            Agents ({counts.agents})
          </TabsTrigger>
          <TabsTrigger value="tool">
            Tools ({counts.tools})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />

        {/* Show provider filter for models tab */}
        {tab === "model" && <ProviderFilter />}

        {/* Show category filter for tools tab */}
        {tab === "tool" && <CategoryFilter />}

        {/* Clear filters button */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}

        {/* View mode toggle */}
        <div className="ml-auto flex gap-1">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => onViewModeChange("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => onViewModeChange("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

### 3.5 Hook for Filtered Data

**`hooks/store/useStoreFilters.ts`**:
```typescript
import { useMemo } from "react";
import { useStoreFiltersStore } from "@/store/storeFiltersStore";
import { useServiceLists } from "./useServiceLists";

export function useFilteredServices() {
  const { models, agents, tools, isLoading } = useServiceLists();
  const { search, providers, categories, tab } = useStoreFiltersStore();

  const filteredModels = useMemo(() => {
    if (tab !== "model") return models;

    return models.filter((model) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          model.name?.toLowerCase().includes(searchLower) ||
          model.description?.toLowerCase().includes(searchLower) ||
          model.provider?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Provider filter
      if (providers.length > 0) {
        if (!providers.includes(model.provider || "")) return false;
      }

      return true;
    });
  }, [models, search, providers, tab]);

  const filteredAgents = useMemo(() => {
    if (tab !== "agent") return agents;

    return agents.filter((agent) => {
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          agent.name?.toLowerCase().includes(searchLower) ||
          agent.description?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      return true;
    });
  }, [agents, search, tab]);

  const filteredTools = useMemo(() => {
    if (tab !== "tool") return tools;

    return tools.filter((tool) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          tool.name?.toLowerCase().includes(searchLower) ||
          tool.agent_name?.toLowerCase().includes(searchLower) ||
          tool.description?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (categories.length > 0) {
        const toolCategory = tool.metadata?.category || tool.category || "Uncategorized";
        if (!categories.includes(toolCategory)) return false;
      }

      return true;
    });
  }, [tools, search, categories, tab]);

  return {
    models: filteredModels,
    agents: filteredAgents,
    tools: filteredTools,
    isLoading,
    counts: {
      models: filteredModels.length,
      agents: filteredAgents.length,
      tools: filteredTools.length,
    },
  };
}
```

---

### 3.6 Files to Delete

After refactoring, remove the old ChatSidebar:
- `components/chat/ChatSidebar.tsx` (replaced by AppSidebar)

---

### Summary of Phase 3 Changes

| Component | Action | Description |
|-----------|--------|-------------|
| `AppSidebar` | **Create** | Full sidebar with nav, sessions, footer |
| `app/layout.tsx` | **Modify** | Add SidebarProvider + AppSidebar |
| `ChatInterface` | **Modify** | Add header with SidebarTrigger + title |
| `StoreItem` | **Create** | Unified detail page for all types |
| `FilterPopover` | **Create** | Reusable filter popover component |
| `ProviderFilter` | **Create** | Provider multi-select filter |
| `CategoryFilter` | **Create** | Category filter for tools |
| `StoreHeader` | **Modify** | Add filters integration |
| `storeFiltersStore` | **Create** | Filter state management |
| `useFilteredServices` | **Create** | Hook for filtered data |
| `types/filters.ts` | **Create** | Filter type definitions |
| `ChatSidebar` | **Delete** | Replaced by AppSidebar |

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
- [ ] Full AppSidebar (shadcn/ui sidebar pattern)
- [ ] ChatInterface with integrated header
- [ ] Unified StoreItem detail page
- [ ] Store filters (search + provider + category)
- [ ] Per-session tool overrides UI
- [ ] Tool call/result UI display

### V4 (FUTURE)
- [ ] Multi-modal support (images, vision)
- [ ] File attachments with storage
- [ ] Custom MCP server UI configuration
- [ ] Export/import sessions
- [ ] Tool approval workflow (for sensitive tools)
