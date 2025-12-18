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
