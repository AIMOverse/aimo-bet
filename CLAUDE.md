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
│       │   └── route.ts         # Chat API with tool execution + image generation
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
│       ├── image.tsx            # Generated image display component
│       ├── tool.tsx             # Tool call/result display (Tool, ToolHeader, ToolContent, ToolInput, ToolOutput)
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
Browser → /api/chat    → AiMo Network/OpenRouter → Streaming Response (text + images)
Browser → /api/models  → AiMo Network → Models List
Browser → /api/agents  → AiMo Network → Agents List
Browser → /api/tools   → AiMo Network → Tools List
```

- Keeps API keys server-side (more secure)
- Enables rate limiting and logging
- Tool execution happens server-side
- Image generation goes through chat/completions endpoint

### Tool System Architecture

Three-tier tool system:

```
┌─────────────────────────────────────────────────────────────┐
│  1. Built-in Tools (AI SDK tools)                           │
│     - Defined in config/tools.ts                            │
│     - Full type safety, same-process execution              │
│     - Always available                                      │
│     - Includes: generateImage tool (enabled by default)     │
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

---

## Phase 4: Image Generation Integration

### Overview

Image generation uses the **chat/completions endpoint** (OpenRouter-compatible) with support for three model capability types:

1. **Text-only models** - Use `generateImage` tool to call dedicated image models
2. **Image-only models** - Dedicated image generation via chat/completions (DALL-E, Flux, Imagen)
3. **Multimodal output models** - LLMs that can generate images inline (Gemini 2.5 Flash)

### OpenRouter Image Generation Pattern

Image generation is handled through the standard chat/completions endpoint with the `modalities` parameter:

**Request Format:**
```typescript
// POST /api/v1/chat/completions
{
  model: "google/gemini-2.5-flash-image-preview", // or image-capable model
  messages: [{ role: "user", content: "Generate an image of a sunset" }],
  modalities: ["image", "text"], // Request both image and text output
  image_config: {
    aspect_ratio: "16:9" // Optional, for Gemini models
  }
}
```

**Response Format:**
```typescript
{
  choices: [{
    message: {
      role: "assistant",
      content: "Here's a beautiful sunset image...",
      images: [{
        type: "image_url",
        image_url: {
          url: "data:image/png;base64,..." // Base64-encoded image
        }
      }]
    }
  }]
}
```

### Model Capability Types

```typescript
// types/models.ts
interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  // ... existing fields
  
  // Output modalities supported by the model
  outputModalities: ("text" | "image")[];
  
  // For image-capable models
  imageSettings?: {
    supportedSizes?: string[];         // e.g., ["1024x1024", "1792x1024"]
    supportedAspectRatios?: string[];  // e.g., ["1:1", "16:9", "3:2"]
    maxImagesPerCall?: number;
    defaultAspectRatio?: string;
  };
}
```

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ChatInterface                                 │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ ChatMessage                                                    │  │
│  │  - Renders text parts via <Streamdown>                        │  │
│  │  - Renders image parts via <Image> component                  │  │
│  │  - Renders tool parts via <Tool> components (existing)        │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         /api/chat                                    │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Route Handler                                                  │  │
│  │  1. Check model.outputModalities                               │  │
│  │  2. If includes "image" → add modalities: ["image", "text"]   │  │
│  │  3. Forward to OpenRouter/AiMo Network chat/completions        │  │
│  │  4. Parse response.message.images[] if present                 │  │
│  │  5. Stream response with toUIMessageStreamResponse()           │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
┌─────────────────────────────┐  ┌─────────────────────────────────────┐
│  Multimodal Model Path       │  │  Tool-based Path                    │
│  (Gemini 2.5 Flash, etc.)    │  │  (GPT-4 + generateImage tool)       │
│                              │  │                                     │
│  modalities: ["image","text"]│  │  Tool calls generateImage           │
│  Response includes images[]  │  │  → Calls image model via API        │
│  in message body             │  │  → Returns base64 in tool result    │
└─────────────────────────────┘  └─────────────────────────────────────┘
```

### Implementation Plan

#### 4.1 Update Model Types

**`types/models.ts`** - Add output modalities:
```typescript
export type OutputModality = "text" | "image";

export interface ImageSettings {
  supportedSizes?: string[];
  supportedAspectRatios?: string[];
  maxImagesPerCall?: number;
  defaultAspectRatio?: string;
}

export interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextLength?: number;
  pricing?: { prompt: number; completion: number };
  outputModalities: OutputModality[];  // ["text"] or ["image"] or ["text", "image"]
  imageSettings?: ImageSettings;
}
```

#### 4.2 Example Model Configurations

**`config/models.ts`** - Models with image capabilities:
```typescript
export const MODELS: ModelDefinition[] = [
  // Text-only model (uses generateImage tool for images)
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    outputModalities: ["text"],
    // No imageSettings - uses tool for image generation
  },
  
  // Multimodal output model (native image generation)
  {
    id: "google/gemini-2.5-flash-image-preview",
    name: "Gemini 2.5 Flash (Image)",
    provider: "google",
    outputModalities: ["text", "image"],
    imageSettings: {
      supportedAspectRatios: ["1:1", "16:9", "9:16", "3:2", "2:3", "4:3", "3:4"],
      defaultAspectRatio: "1:1",
    },
  },
  
  // Image-only model
  {
    id: "black-forest-labs/flux-pro",
    name: "FLUX Pro",
    provider: "black-forest-labs",
    outputModalities: ["image"],
    imageSettings: {
      supportedAspectRatios: ["1:1", "16:9", "9:16", "3:2", "2:3"],
      defaultAspectRatio: "1:1",
    },
  },
];
```

#### 4.3 Add generateImage Built-in Tool

**`config/tools.ts`** - Add to BUILT_IN_TOOLS:
```typescript
import { experimental_generateImage as generateImage } from "ai";
import { openai } from "@ai-sdk/openai";

export const BUILT_IN_TOOLS = {
  // ... existing tools
  
  generateImage: tool({
    description: "Generate an image from a text description. Use this when the user asks you to create, draw, generate, or make an image.",
    inputSchema: z.object({
      prompt: z.string().describe("Detailed description of the image to generate. Be specific about style, composition, colors, and subject matter."),
      size: z.enum(["1024x1024", "1792x1024", "1024x1792"])
        .default("1024x1024")
        .describe("Image dimensions. Use 1792x1024 for landscape, 1024x1792 for portrait."),
      style: z.enum(["vivid", "natural"])
        .default("vivid")
        .describe("vivid for hyper-real/dramatic, natural for more realistic"),
    }),
    execute: async ({ prompt, size, style }) => {
      const { image } = await generateImage({
        model: openai.image("dall-e-3"),
        prompt,
        size,
        providerOptions: {
          openai: { style, quality: "standard" },
        },
      });
      
      return {
        success: true,
        image: {
          base64: image.base64,
          mediaType: "image/png",
        },
        prompt,
        revisedPrompt: image.revisedPrompt,
      };
    },
  }),
};

// Add to BUILT_IN_TOOL_CONFIGS for UI
export const BUILT_IN_TOOL_CONFIGS: BuiltInToolConfig[] = [
  // ... existing configs
  {
    id: "generateImage",
    name: "Image Generator",
    description: "Generate images from text descriptions using DALL-E 3",
    category: "ai",
    enabled: true, // Enabled by default
  },
];
```

#### 4.4 Update ChatMessage Component

**`components/chat/ChatInterface.tsx`** - Update ChatMessage to handle all part types.

Uses existing components:
- `<Image>` from `@/components/ai-elements/image` for generated images
- `<Tool>`, `<ToolHeader>`, `<ToolContent>`, `<ToolInput>`, `<ToolOutput>` from `@/components/ai-elements/tool` for tool invocations

```typescript
import { Image } from "@/components/ai-elements/image";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";

const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  return (
    <Message from={message.role}>
      <MessageContent>
        {message.parts?.map((part, index) => {
          // Text content
          if (part.type === "text") {
            return message.role === "assistant" ? (
              <Streamdown key={index}>{part.text}</Streamdown>
            ) : (
              <div key={index} className="whitespace-pre-wrap">{part.text}</div>
            );
          }
          
          // Image parts (from multimodal models or parsed from response.images[])
          if (part.type === "file" && part.mediaType?.startsWith("image/")) {
            return (
              <Image
                key={index}
                base64={part.data}
                mediaType={part.mediaType}
                alt="Generated image"
                className="mt-2 max-w-md"
              />
            );
          }
          
          // Tool invocations - use existing Tool components
          if (part.type === "tool-invocation") {
            const toolPart = part as ToolUIPart;
            
            // Special rendering for generateImage tool results
            if (toolPart.toolName === "generateImage" && toolPart.state === "output-available") {
              const result = toolPart.output as {
                success: boolean;
                image?: { base64: string; mediaType: string };
                prompt: string;
                revisedPrompt?: string;
              };
              
              if (result?.success && result.image) {
                return (
                  <div key={index} className="mt-2 space-y-2">
                    <Image
                      base64={result.image.base64}
                      mediaType={result.image.mediaType}
                      alt={result.revisedPrompt || result.prompt}
                      className="max-w-md rounded-lg"
                    />
                    {result.revisedPrompt && result.revisedPrompt !== result.prompt && (
                      <p className="text-xs text-muted-foreground">
                        Prompt enhanced: {result.revisedPrompt}
                      </p>
                    )}
                  </div>
                );
              }
            }
            
            // Default tool rendering using existing Tool components
            return (
              <Tool key={index}>
                <ToolHeader
                  title={toolPart.toolName}
                  type={toolPart.type}
                  state={toolPart.state}
                />
                <ToolContent>
                  <ToolInput input={toolPart.input} />
                  <ToolOutput output={toolPart.output} errorText={toolPart.errorText} />
                </ToolContent>
              </Tool>
            );
          }
          
          return null;
        })}
      </MessageContent>
    </Message>
  );
});
```

#### 4.5 Update Chat API Route

**`app/api/chat/route.ts`** - Handle image modalities:
```typescript
import { streamText, UIMessage, ToolSet } from "ai";
import { getModelById } from "@/config/models";

export async function POST(req: Request) {
  const { messages, model, enabledTools } = await req.json();
  
  const modelDef = getModelById(model);
  const supportsImageOutput = modelDef?.outputModalities?.includes("image");
  
  // Build request body
  const requestBody: Record<string, unknown> = {
    model,
    messages: simpleMessages,
  };
  
  // Add modalities for image-capable models
  if (supportsImageOutput) {
    requestBody.modalities = modelDef.outputModalities; // ["text", "image"] or ["image"]
    
    // Add image_config if model has settings
    if (modelDef.imageSettings?.defaultAspectRatio) {
      requestBody.image_config = {
        aspect_ratio: modelDef.imageSettings.defaultAspectRatio,
      };
    }
  }
  
  // Set up tools (for text-only models, generateImage tool is available)
  const { tools, mcpClients } = await setupTools(enabledTools);
  
  const result = streamText({
    model: aimo.chat(model),
    system: DEFAULT_SYSTEM_PROMPT,
    messages: simpleMessages,
    tools: hasTools ? tools : undefined,
    maxSteps: 5,
    // Pass modalities through experimental options if needed
    experimental_providerMetadata: supportsImageOutput ? {
      modalities: modelDef.outputModalities,
    } : undefined,
  });
  
  return result.toUIMessageStreamResponse();
}
```

### Image Storage Strategy

For V1, images are stored **inline as base64** in message parts. This keeps the implementation simple but has tradeoffs:

| Approach | Pros | Cons |
|----------|------|------|
| Base64 inline | Simple, works offline, no extra infra | Bloats localStorage, ~1.3x size overhead |
| URL + storage | Smaller messages, shareable links | Requires storage (Supabase/S3), extra complexity |

Future optimization: When Supabase storage is enabled, upload images and store URLs instead.

### UI Considerations

1. **Loading state**: Image generation takes 5-15 seconds. The existing `Tool` component shows "Running" state with spinner.
2. **Error handling**: Use `ToolOutput` with `errorText` prop for rejected prompts.
3. **Download**: Add a download button to the `<Image>` component.
4. **Aspect ratio selector**: For multimodal models, allow user to select aspect ratio before sending.

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

### 3.1 AppSidebar Refactor

Refactor AppSidebar to split session management into a separate ChatSidebar component with enhanced features.

#### UI Layout (SidebarContent)

```
┌─────────────────────────────┐
│  + New Chat                 │  ← Button (creates new session)
│  🏪 Browse Store            │  ← Link to /store
├─────────────────────────────┤
│  History                    │  ← Label
│  [🔍 Search sessions...]    │  ← Search input (filter by title)
│                             │
│  Today's Chat      1m ago ⋮│  ← Session item with relative time + popover
│  Another Chat      2h ago ⋮│
│  Old Session       3d ago ⋮│
│  ...                        │
└─────────────────────────────┘
│  ⚙️ Settings                │  ← Footer (kept)
└─────────────────────────────┘
```

#### Session Item Popover Menu

Each session has a "..." (MoreHorizontal) button that opens a popover with:
- **Rename** - Opens a dialog/modal to edit session title
- **Delete** - Deletes the session (with confirmation optional)

#### File Structure

| File | Responsibility |
|------|----------------|
| `components/layout/AppSidebar.tsx` | Main sidebar shell: header, "New Chat" button, "Browse Store" link, ChatSidebar, footer |
| `components/layout/ChatSidebar.tsx` | History section: search input, session list with relative time, popover actions |
| `components/layout/RenameSessionDialog.tsx` | Dialog/modal for renaming a session |

#### New Files

**`components/layout/ChatSidebar.tsx`**:
```typescript
"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, MoreHorizontal, Pencil, Trash2, Search } from "lucide-react";
import { useSessions } from "@/hooks/chat";
import { useSessionStore } from "@/store/sessionStore";
import { formatRelativeTime } from "@/lib/utils";
import { RenameSessionDialog } from "./RenameSessionDialog";

export function ChatSidebar() {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();

  const { sessions, deleteSession, updateSession, isLoading } = useSessions();
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const setCurrentSession = useSessionStore((s) => s.setCurrentSession);

  const [search, setSearch] = useState("");
  const [renameSession, setRenameSession] = useState<{ id: string; title: string } | null>(null);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;
    const query = search.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(query));
  }, [sessions, search]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setCurrentSession(sessionId);
      router.push(`/chat/${sessionId}`);
      if (isMobile) setOpenMobile(false);
    },
    [setCurrentSession, router, isMobile, setOpenMobile]
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      setOpenPopoverId(null);
      await deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        router.push("/");
      }
    },
    [deleteSession, currentSessionId, router]
  );

  const handleRenameClick = useCallback((session: { id: string; title: string }) => {
    setOpenPopoverId(null);
    setRenameSession(session);
  }, []);

  const handleRenameSubmit = useCallback(
    async (newTitle: string) => {
      if (renameSession) {
        await updateSession(renameSession.id, { title: newTitle });
        setRenameSession(null);
      }
    },
    [renameSession, updateSession]
  );

  return (
    <>
      <SidebarGroup className="flex-1">
        <SidebarGroupLabel>History</SidebarGroupLabel>
        <SidebarGroupContent>
          {/* Search Input */}
          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>

          {/* Session List */}
          <ScrollArea className="h-[calc(100vh-320px)]">
            <SidebarMenu>
              {isLoading ? (
                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                  Loading...
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                  {search ? "No matching sessions" : "No conversations yet."}
                </div>
              ) : (
                filteredSessions.map((session) => (
                  <SidebarMenuItem key={session.id} className="group">
                    <SidebarMenuButton
                      onClick={() => handleSelectSession(session.id)}
                      isActive={currentSessionId === session.id}
                      className="pr-8"
                    >
                      <MessageSquare className="h-4 w-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="truncate block">{session.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(session.updatedAt || session.createdAt)}
                        </span>
                      </div>
                    </SidebarMenuButton>

                    {/* Popover Menu */}
                    <Popover
                      open={openPopoverId === session.id}
                      onOpenChange={(open) => setOpenPopoverId(open ? session.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-40 p-1" align="end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => handleRenameClick({ id: session.id, title: session.title })}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Rename
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-destructive hover:text-destructive"
                          onClick={() => handleDeleteSession(session.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </PopoverContent>
                    </Popover>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </ScrollArea>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Rename Dialog */}
      <RenameSessionDialog
        open={!!renameSession}
        onOpenChange={(open) => !open && setRenameSession(null)}
        currentTitle={renameSession?.title || ""}
        onSubmit={handleRenameSubmit}
      />
    </>
  );
}
```

**`components/layout/RenameSessionDialog.tsx`**:
```typescript
"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RenameSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTitle: string;
  onSubmit: (newTitle: string) => Promise<void>;
}

export function RenameSessionDialog({
  open,
  onOpenChange,
  currentTitle,
  onSubmit,
}: RenameSessionDialogProps) {
  const [title, setTitle] = useState(currentTitle);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset title when dialog opens with new session
  useEffect(() => {
    if (open) {
      setTitle(currentTitle);
    }
  }, [open, currentTitle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || title === currentTitle) {
      onOpenChange(false);
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(title.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename Session</DialogTitle>
            <DialogDescription>
              Enter a new name for this chat session.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="session-title" className="sr-only">
              Session Title
            </Label>
            <Input
              id="session-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter session title..."
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

#### Modified Files

**`components/layout/AppSidebar.tsx`** - Simplified, delegates to ChatSidebar:
```typescript
"use client";

import { useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Plus, Store, Settings } from "lucide-react";
import { useSessions } from "@/hooks/chat";
import { useSessionStore } from "@/store/sessionStore";
import { ChatSidebar } from "./ChatSidebar";
import { useCallback } from "react";

export function AppSidebar() {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();

  const { createSession } = useSessions();
  const setCurrentSession = useSessionStore((s) => s.setCurrentSession);

  const handleNewChat = useCallback(async () => {
    const session = await createSession();
    if (session) {
      setCurrentSession(session.id);
      router.push(`/chat/${session.id}`);
      if (isMobile) setOpenMobile(false);
    }
  }, [createSession, setCurrentSession, router, isMobile, setOpenMobile]);

  const handleNavClick = useCallback(
    (href: string) => {
      router.push(href);
      if (isMobile) setOpenMobile(false);
    },
    [router, isMobile, setOpenMobile]
  );

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        <div className="flex items-center justify-between px-2 py-2">
          <span className="font-semibold text-lg">AiMo Chat</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Quick Actions */}
        <SidebarMenu className="px-2 pt-2">
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleNewChat}>
              <Plus className="h-4 w-4" />
              <span>New Chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => handleNavClick("/store")}>
              <Store className="h-4 w-4" />
              <span>Browse Store</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Chat History (delegated to ChatSidebar) */}
        <ChatSidebar />
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => handleNavClick("/settings")}>
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
```

**`lib/utils.ts`** - Add relative time formatter:
```typescript
// Add this function to lib/utils.ts

export function formatRelativeTime(date: Date | string | number): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 4) return `${diffWeek}w ago`;
  return `${diffMonth}mo ago`;
}
```

#### Required Hook Update

**`hooks/chat/useSessions.ts`** - Ensure `updateSession` method exists:
```typescript
// The useSessions hook should expose:
interface UseSessionsReturn {
  sessions: Session[];
  isLoading: boolean;
  createSession: () => Promise<Session | null>;
  deleteSession: (id: string) => Promise<void>;
  updateSession: (id: string, updates: Partial<Session>) => Promise<void>; // Add if missing
}
```

#### Summary of Changes

| File | Action | Description |
|------|--------|-------------|
| `ChatSidebar.tsx` | **Create** | History section with search, session list, relative time, popover actions |
| `RenameSessionDialog.tsx` | **Create** | Dialog/modal for renaming sessions |
| `AppSidebar.tsx` | **Modify** | Simplify to shell + delegate to ChatSidebar |
| `lib/utils.ts` | **Modify** | Add `formatRelativeTime` helper |
| `useSessions.ts` | **Modify** | Ensure `updateSession` method exists |

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

### V3 (UI Refactoring)
- [ ] Full AppSidebar (shadcn/ui sidebar pattern)
- [ ] ChatInterface with integrated header
- [ ] Unified StoreItem detail page
- [ ] Store filters (search + provider + category)
- [ ] Per-session tool overrides UI
- [ ] Tool call/result UI display

### V4 (Image Generation) ← CURRENT FOCUS
- [ ] Add model outputModalities field to type definitions
- [ ] Add generateImage built-in tool (enabled by default)
- [ ] Update ChatMessage to render image parts using existing `<Image>` component
- [ ] Use existing `<Tool>` components for tool invocation display
- [ ] Support multimodal output models via modalities parameter
- [ ] Handle response.message.images[] from OpenRouter/AiMo Network
- [ ] Loading states for image generation
- [ ] Error handling for rejected prompts

### V5 (Future)
- [ ] Multi-modal input (image attachments with vision)
- [ ] File attachments with storage
- [ ] Custom MCP server UI configuration
- [ ] Export/import sessions
- [ ] Tool approval workflow (for sensitive tools)
- [ ] Image storage optimization (URL-based when Supabase enabled)
- [ ] Aspect ratio selector for image-capable models
