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

## App Modes: Chat & Generate

AiMo Chat supports two distinct modes, accessible via tabs in the sidebar:

### Chat Mode (`/chat`)
- Conversational interface with LLMs
- Session-based history
- Routes: `/chat` (new), `/chat/[id]` (existing session)

### Generate Mode (`/generate`)
- For content/image generation tasks (future)
- Session-based history (mirrors chat structure)
- Routes: `/generate` (new), `/generate/[id]` (existing session)
- **Current status**: Empty state placeholder

### Sidebar Tab Navigation

The sidebar includes a tab switcher below the "AiMo Chat" title:
- Tabs: "Chat" | "Generate"
- Active tab derived from URL pathname
- Clicking a tab navigates to the respective route
- "New Chat" button changes to "New Generation" on Generate tab
- Sidebar content changes based on active tab

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
│   ├── library/
│   │   └── page.tsx             # Library/history page
│   └── api/
│       └── chat/route.ts        # Chat API (simplified)
├── components/
│   ├── ui/                      # shadcn/ui primitives
│   ├── layout/
│   │   ├── AppSidebar.tsx       # Main sidebar with mode tabs
│   │   ├── AppHeader.tsx        # Header component
│   │   └── ThemeProvider.tsx    # Theme context
│   ├── chat/
│   │   ├── ChatInterface.tsx    # Main chat UI
│   │   ├── ChatSidebar.tsx      # Chat session list
│   │   ├── ChatModelSelector.tsx
│   │   └── ChatToolSelector.tsx
│   └── account/
│       └── AccountPopover.tsx   # User account menu
├── hooks/
│   └── chat/
│       ├── useChatMessages.ts   # Chat logic
│       └── useSessions.ts       # Session management
├── store/
│   ├── chatStore.ts             # Chat state
│   ├── toolStore.ts             # Tool state
│   └── index.ts                 # Store exports
└── types/
    └── chat.ts                  # Message, Session types
```

---

## Implementation: Sidebar Mode Tabs

### AppSidebar Component Changes

```typescript
// components/layout/AppSidebar.tsx
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePathname, useRouter } from "next/navigation";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  
  // Derive active tab from URL
  const activeTab = pathname.startsWith("/generate") ? "generate" : "chat";
  
  const handleTabChange = (value: string) => {
    router.push(`/${value}`);
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        {/* Title */}
        <div className="flex items-center justify-between px-2 py-2">
          <span className="font-semibold text-lg">AiMo Chat</span>
        </div>
        
        {/* Mode Tabs */}
        <div className="px-2 pb-2">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="w-full">
              <TabsTrigger value="chat" className="flex-1">Chat</TabsTrigger>
              <TabsTrigger value="generate" className="flex-1">Generate</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Dynamic "New" button */}
        <SidebarMenu className="px-2 pt-2">
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleNew}>
              <Plus className="h-4 w-4" />
              <span>{activeTab === "chat" ? "New Chat" : "New Generation"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Tab-specific content */}
        {activeTab === "chat" ? (
          <ChatSidebar />
        ) : (
          <GenerateSidebar /> {/* Empty state for now */}
        )}
      </SidebarContent>
      
      {/* ... footer */}
    </Sidebar>
  );
}
```

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `components/layout/AppSidebar.tsx` | **Modify** | Add tabs, derive active tab from URL |
| `app/generate/page.tsx` | **Create** | Empty state placeholder page |
| `app/generate/[id]/page.tsx` | **Create** | Session page placeholder |
| `components/generate/GenerateSidebar.tsx` | **Create** | Empty sidebar for generate mode |

### Implementation Steps

1. **Update AppSidebar** - Add Tabs component, usePathname for active state
2. **Create `/generate` route** - Simple placeholder with "Coming Soon" message
3. **Create `/generate/[id]` route** - Placeholder for future sessions
4. **Create GenerateSidebar** - Empty state component for sidebar content
5. **Update "New" button** - Dynamic label based on active tab

---

## Code Style

- Use `@/` path alias for imports
- Use `@/lib/utils` for className merging (`cn` function)
- Functional components with TypeScript
- Keep components focused and single-purpose
- **User-friendly language** - avoid developer jargon in UI

### Component Patterns

```typescript
// Preferred: Named exports, clear prop types
export function ModelSelector({ 
  value, 
  onChange 
}: ModelSelectorProps) {
  // ...
}
```

### Store Patterns

```typescript
// Zustand store with persist middleware
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      endpoint: 'https://api.openai.com/v1',
      setApiKey: (key) => set({ apiKey: key }),
      setEndpoint: (url) => set({ endpoint: url }),
    }),
    { name: 'aimo-chat-settings' }
  )
);
```

---

## Roadmap

### V1 - COMPLETE
- [x] Basic chat interface
- [x] Model selection
- [x] Session management
- [x] Markdown rendering
- [x] Dark/light theme

### V2 - COMPLETE
- [x] Store page (models, agents, tools)
- [x] Agent/tool selection in chat
- [x] MCP tool support

### V3 - Simplification (CURRENT)
- [x] Remove store/agent/tool complexity
- [ ] Add Chat/Generate mode tabs in sidebar
- [ ] Create `/generate` route structure
- [ ] Simplified settings page
- [ ] User-centered UI language
- [ ] Privacy-first messaging

### V4 - Future Considerations
- [ ] Generate mode implementation (image/content generation)
- [ ] Export/import chat history
- [ ] Multiple API endpoints
- [ ] Optional encryption for stored chats
- [ ] Mobile-optimized UI
