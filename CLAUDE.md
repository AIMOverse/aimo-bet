# Implementation Plan: Chat Agent Abstraction with ToolLoopAgent

## Overview

Refactor the chat API to use a `ToolLoopAgent` abstraction. This encapsulates the model, tools, system prompt, and loop control into a reusable agent class in `lib/ai/agents/`. The agent uses `callOptionsSchema` and `prepareCall` for dynamic configuration based on request parameters (model selection, tool enablement).

---

## Why ToolLoopAgent?

1. **Encapsulation** - Model, tools, and system prompt defined in one place
2. **Dynamic configuration** - `callOptionsSchema` + `prepareCall` handle per-request tool/model selection
3. **Future-ready** - Easy to add multi-step agent loops, `prepareStep` for dynamic behavior
4. **Type safety** - `InferAgentUIMessage` provides end-to-end typed messages
5. **Cleaner API route** - Route focuses on request handling, agent handles AI logic

---

## Files to Create/Modify

### 1. Create `lib/ai/agents/chatAgent.ts`

Define the main chat agent using `ToolLoopAgent`:

```typescript
import { ToolLoopAgent, stepCountIs } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/registry";
import { DEFAULT_SYSTEM_PROMPT } from "@/config/defaults";
import { generateImageTool, generateVideoTool } from "@/lib/ai/tools";

// Schema for runtime call options
const chatCallOptionsSchema = z.object({
  model: z.string().default("openrouter/gpt-4o"),
  tools: z.object({
    generateImage: z.boolean().default(false),
    generateVideo: z.boolean().default(false),
    webSearch: z.boolean().default(false),
  }).default({}),
});

export type ChatCallOptions = z.infer<typeof chatCallOptionsSchema>;

// All available tools
const allTools = {
  generateImage: generateImageTool,
  generateVideo: generateVideoTool,
  // Future: webSearch, etc.
};

export const chatAgent = new ToolLoopAgent({
  // Default model (overridden by prepareCall)
  model: getModel("openrouter/gpt-4o"),
  
  // System instructions
  instructions: DEFAULT_SYSTEM_PROMPT,
  
  // All tools available to the agent
  tools: allTools,
  
  // Stop after 5 steps max (for multi-tool scenarios)
  stopWhen: stepCountIs(5),
  
  // Call options schema for type-safe runtime configuration
  callOptionsSchema: chatCallOptionsSchema,
  
  // Configure agent based on request options
  prepareCall: ({ options, ...settings }) => {
    // Determine which tools are active based on request
    const activeTools: string[] = [];
    if (options.tools.generateImage) activeTools.push("generateImage");
    if (options.tools.generateVideo) activeTools.push("generateVideo");
    // Future: if (options.tools.webSearch) activeTools.push("webSearch");
    
    return {
      ...settings,
      model: getModel(options.model),
      activeTools: activeTools.length > 0 ? activeTools : undefined,
    };
  },
});

// Export type for UI message typing
export type ChatAgentUIMessage = typeof chatAgent extends ToolLoopAgent<
  infer _T,
  infer _O,
  infer M
>
  ? M
  : never;
```

### 2. Update `lib/ai/agents/index.ts`

Export the chat agent:

```typescript
export { chatAgent, type ChatCallOptions, type ChatAgentUIMessage } from "./chatAgent";
```

### 3. Modify `app/api/chat/route.ts`

Simplify the route to use the agent:

```typescript
import { UIMessage, createIdGenerator, convertToModelMessages } from "ai";
import { chatAgent } from "@/lib/ai/agents";
import { getModelById } from "@/lib/ai/models/models";
import {
  saveChat,
  loadMessages,
  generateSessionId,
} from "@/lib/supabase/messages";

// ============================================================================
// Types
// ============================================================================

interface ChatRequest {
  message: UIMessage;
  sessionId: string | null;
  model?: string;
  tools?: {
    generateImage?: boolean;
    generateVideo?: boolean;
    webSearch?: boolean;
  };
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(req: Request) {
  try {
    const {
      message,
      sessionId,
      model = "openrouter/gpt-4o",
      tools = {},
    }: ChatRequest = await req.json();

    // Validate message
    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate API key is configured
    if (!process.env.OPENROUTER_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Determine session ID (create new if not provided)
    const finalSessionId = sessionId ?? generateSessionId();

    // Validate UUID format
    const isValidUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        finalSessionId,
      );
    if (!isValidUUID) {
      return new Response(
        JSON.stringify({ error: "Invalid session ID format" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Load previous messages from DB and append new message
    const previousMessages = sessionId ? await loadMessages(sessionId) : [];
    const messages = [...previousMessages, message];

    // Check if model supports image output for provider options
    const modelDef = getModelById(model);
    const supportsImageOutput = modelDef?.outputModalities?.includes("image");
    const providerOptions =
      supportsImageOutput && modelDef
        ? {
            openai: {
              modalities: modelDef.outputModalities,
              ...(modelDef.imageSettings?.defaultAspectRatio && {
                image_config: {
                  aspect_ratio: modelDef.imageSettings.defaultAspectRatio,
                },
              }),
            },
          }
        : undefined;

    // Stream response from agent
    const stream = chatAgent.stream({
      messages: await convertToModelMessages(messages),
      options: {
        model,
        tools: {
          generateImage: tools.generateImage ?? false,
          generateVideo: tools.generateVideo ?? false,
          webSearch: tools.webSearch ?? false,
        },
      },
      providerOptions,
    });

    // Return streaming response with message ID generation
    return stream.toUIMessageStreamResponse({
      originalMessages: messages,
      generateMessageId: createIdGenerator({
        prefix: "msg",
        size: 16,
      }),
      onFinish: async ({ messages: finalMessages }) => {
        try {
          await saveChat({
            sessionId: finalSessionId,
            messages: finalMessages,
            modelId: model,
          });
        } catch (error) {
          console.error("Failed to save chat:", error);
        }
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    if (error instanceof Error) {
      if (error.message.includes("API key")) {
        return new Response(JSON.stringify({ error: "Invalid API key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (error.message.includes("rate limit")) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
```

---

## Key Changes from Current Implementation

| Aspect | Before | After |
|--------|--------|-------|
| AI logic location | Inline in route.ts | Encapsulated in `chatAgent` |
| Tool selection | Manual object building | `activeTools` via `prepareCall` |
| Model selection | Direct `getModel()` call | Via `callOptionsSchema` |
| Streaming | `streamText()` | `chatAgent.stream()` |
| Type safety | Manual types | `InferAgentUIMessage` |

---

## Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              Data Flow                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Client sends { message, model, tools: { generateImage: true } }     │
│                                                                          │
│  2. /api/chat/route.ts                                                  │
│     └─► Validates request, loads messages                               │
│     └─► Calls chatAgent.stream({ messages, options })                  │
│                                                                          │
│  3. chatAgent.prepareCall()                                             │
│     └─► Receives options: { model, tools }                              │
│     └─► Returns { model: getModel(model), activeTools: [...] }         │
│                                                                          │
│  4. Agent executes with configured model and tools                      │
│     └─► LLM decides to call generateImage tool                         │
│     └─► Tool executes, returns result                                   │
│     └─► Loop continues if more steps needed (up to 5)                  │
│                                                                          │
│  5. stream.toUIMessageStreamResponse()                                  │
│     └─► Streams response to client                                      │
│     └─► onFinish saves chat to database                                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `lib/ai/agents/chatAgent.ts` | Create | ToolLoopAgent definition with prepareCall |
| `lib/ai/agents/index.ts` | Modify | Export chatAgent and types |
| `app/api/chat/route.ts` | Modify | Use chatAgent.stream() instead of streamText() |

---

## Notes

- **No client-side changes** - The request body format remains the same
- **Existing tools unchanged** - `generateImageTool` and `generateVideoTool` work as-is
- **providerOptions** - Still handled in route for model-specific image output config
- **Session/persistence** - Remains in route (agent doesn't handle persistence)
- **stopWhen: stepCountIs(5)** - Allows up to 5 tool calls per request for multi-step scenarios

---

## Future Enhancements

Once this abstraction is in place, adding new capabilities becomes straightforward:

1. **New tools** - Add to `allTools` object, update `prepareCall` logic
2. **Multi-step agents** - Use `prepareStep` for dynamic behavior between steps
3. **Specialized agents** - Create new agents (e.g., `codeAgent`, `researchAgent`) following same pattern
4. **Agent routing** - Route to different agents based on user intent
