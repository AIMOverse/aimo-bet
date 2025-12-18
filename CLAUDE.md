# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**aimo-chat** is an open-source chat UI for interacting with LLMs. It's designed for developers with basic AI knowledge who want a ready-to-use chat interface with their own API keys (BYOK - Bring Your Own Key).

### Key Principles

1. **Zero account required** - No sign-up, no auth, just add your API key and start chatting
2. **BYOK (Bring Your Own Key)** - Works with any OpenAI-compatible API
3. **Supabase-first storage** - Supabase for persistence, localStorage for caching
4. **Minimal configuration** - Works out of the box with sensible defaults

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19 + shadcn/ui (new-york style) + Tailwind CSS 4
- **AI Integration**: Vercel AI SDK (`ai` package v6, `@ai-sdk/openai`, `@ai-sdk/mcp`)
- **State Management**: Zustand (minimal, UI-only state)
- **Storage**: Supabase (primary) + localStorage (cache + agent config)
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
│   │   ├── new/page.tsx         # New chat page
│   │   └── [id]/page.tsx        # Session-specific chat page
│   ├── agent/
│   │   └── page.tsx             # Agent configuration page
│   ├── store/
│   │   ├── page.tsx             # Store listing (models, agents, tools)
│   │   └── [id]/page.tsx        # StoreItem detail page
│   └── api/
│       ├── chat/route.ts        # Chat API with persistence + tool execution
│       ├── sessions/route.ts    # Session CRUD API
│       ├── models/route.ts      # Models registry proxy
│       ├── agents/route.ts      # Agents registry proxy
│       └── tools/route.ts       # Tools registry proxy
├── components/
│   ├── ui/                      # shadcn/ui primitives
│   ├── layout/                  # AppSidebar, ChatSidebar
│   ├── chat/                    # ChatInterface, selectors
│   ├── agent/                   # Agent configuration components
│   └── store/                   # Store components
├── hooks/
│   ├── chat/                    # useChatMessages, useSessions, useAgents, useTools
│   └── store/                   # Store hooks
├── store/
│   ├── sessionStore.ts          # Current session ID
│   ├── modelStore.ts            # Selected model ID
│   ├── agentStore.ts            # Agent selection + custom agent config
│   └── toolStore.ts             # Global enabled tools
├── types/
│   ├── chat.ts                  # Message, Session types
│   ├── agents.ts                # Agent types (A2A protocol)
│   └── tools.ts                 # Tool types (MCP + built-in)
└── config/
    ├── agents.ts                # Default agents, categories
    └── tools.ts                 # Built-in tools, categories
```

---

## Agent Configuration Architecture

### Overview

Users can configure a **custom agent** that combines:
- **Model** - Which LLM to use
- **Tools** - What capabilities it has
- **System Prompt** - Instructions/personality
- **Settings** - Loop control parameters

```
┌─────────────────────────────────────────────────────────────┐
│  Agent Sources                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐         ┌─────────────────────────┐   │
│  │  Preset Agents  │         │    Custom Agent         │   │
│  │  (from AiMo     │         │    (localStorage)       │   │
│  │   Network)      │         │                         │   │
│  └────────┬────────┘         └───────────┬─────────────┘   │
│           │                              │                  │
│           └──────────┬───────────────────┘                  │
│                      ▼                                      │
│           ┌─────────────────────┐                          │
│           │  Agent Selector     │                          │
│           │  (in Chat UI)       │                          │
│           └─────────────────────┘                          │
│                                                             │
│  Future: aimo-node backend replaces localStorage            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Custom Agent Schema (AI SDK aligned)

```typescript
// types/agents.ts
interface CustomAgentConfig {
  id: string;                    // Local UUID
  name: string;
  description?: string;

  // Core AI SDK Agent properties
  modelId: string;               // e.g., "openai/gpt-4o"
  tools: string[];               // Tool IDs to enable
  systemPrompt?: string;         // System instruction

  // Agent settings (maps to AI SDK Agent options)
  settings?: {
    maxSteps?: number;           // stopWhen: stepCountIs(n)
    temperature?: number;        // Model temperature
  };

  createdAt: string;
  updatedAt: string;
}
```

### Agent Store

```typescript
// store/agentStore.ts
interface AgentState {
  // Selection state
  selectedAgentId: string | null;
  selectedAgentSource: 'preset' | 'custom' | null;

  // Custom agent (single, stored in localStorage)
  customAgent: CustomAgentConfig | null;

  // Actions
  setSelectedAgent: (id: string | null, source: 'preset' | 'custom' | null) => void;
  setCustomAgent: (config: CustomAgentConfig) => void;
  updateCustomAgent: (updates: Partial<CustomAgentConfig>) => void;
  clearSelection: () => void;
}
```

### Agent Configuration Page (`/agent`)

A dedicated page for configuring the custom agent:

| Section | Component | Description |
|---------|-----------|-------------|
| Header | - | Page title, save button |
| Name & Description | Input + Textarea | Agent identity |
| Model | `ChatModelSelector` (reused) | Select LLM |
| Tools | `ChatToolSelector` (reused) | Multi-select tools |
| System Prompt | Textarea (shadcn) | Agent instructions |
| Settings | Collapsible | Max steps, temperature |

### Integration with Chat

When a custom agent is selected in chat:

```typescript
// In /api/chat route
import { Experimental_Agent as Agent, stepCountIs } from 'ai';

if (customAgentConfig) {
  const agent = new Agent({
    model: aimo.chat(customAgentConfig.modelId),
    tools: loadToolsById(customAgentConfig.tools),
    system: customAgentConfig.systemPrompt,
    stopWhen: stepCountIs(customAgentConfig.settings?.maxSteps ?? 20),
  });

  // Use agent.generate() instead of streamText()
}
```

---

## Implementation Plan

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `types/agents.ts` | **Modify** | Add `CustomAgentConfig` interface |
| `store/agentStore.ts` | **Modify** | Add custom agent state + persistence |
| `app/agent/page.tsx` | **Create** | Agent configuration page |
| `components/agent/AgentConfigForm.tsx` | **Create** | Main configuration form |
| `components/agent/AgentModelSelector.tsx` | **Create** | Model selector for agent page |
| `components/agent/AgentToolSelector.tsx` | **Create** | Tool multi-select for agent page |
| `components/agent/AgentSystemPrompt.tsx` | **Create** | System prompt textarea |
| `components/agent/AgentSettings.tsx` | **Create** | Advanced settings (collapsible) |
| `components/chat/ChatAgentSelector.tsx` | **Modify** | Add "My Agent" option |
| `hooks/chat/useChatMessages.ts` | **Modify** | Pass agent config to API |
| `app/api/chat/route.ts` | **Modify** | Handle agent-based chat |

### Implementation Steps

1. **Update types** - Add `CustomAgentConfig` to `types/agents.ts`
2. **Update agentStore** - Add custom agent state with localStorage persistence
3. **Create `/agent` page** - Basic layout with form sections
4. **Build form components** - Reuse existing selectors where possible
5. **Update ChatAgentSelector** - Add "My Agent" option alongside presets
6. **Integrate with chat API** - Pass agent config, use AI SDK Agent class

---

## Code Style

- Use `@/` path alias for imports
- Use `@/lib/utils` for className merging (`cn` function)
- Functional components with TypeScript
- Use `memo` for expensive components
- Keep components focused and single-purpose

### Component Patterns

```typescript
// Preferred: Named exports, memo for expensive components
export const AgentConfigForm = memo(function AgentConfigForm({
  agent,
  onSave,
}: AgentConfigFormProps) {
  // ...
});
```

### Store Patterns

```typescript
// Zustand store with persist middleware for localStorage
export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      customAgent: null,
      setCustomAgent: (config) => set({ customAgent: config }),
    }),
    { name: "aimo-chat-agent" }
  )
);
```

---

## Roadmap

### V1 ✅ COMPLETE
- [x] Basic chat interface with AiMo Network
- [x] Model selection
- [x] Session management
- [x] Markdown rendering + code highlighting
- [x] Dark/light theme

### V2 ✅ COMPLETE
- [x] Store page (models, agents, tools listing)
- [x] Agent selection in chat (preset agents)
- [x] Tool selection in chat (multi-select)
- [x] Built-in AI SDK tools
- [x] MCP tool support

### V3 (Agent Configuration) ← CURRENT
- [ ] Custom agent schema (`CustomAgentConfig`)
- [ ] Updated agentStore with custom agent persistence
- [ ] `/agent` configuration page
- [ ] Agent form components (model, tools, system prompt, settings)
- [ ] ChatAgentSelector with "My Agent" option
- [ ] Chat API integration with AI SDK Agent class

### V4 (Future)
- [ ] Multiple custom agents
- [ ] Agent import/export
- [ ] aimo-node backend integration
- [ ] Agent sharing via registry
