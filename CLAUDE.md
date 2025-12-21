# Implementation Plan: Meganova Image Generation Tool

## Overview

Add a `generateImage` tool to the chat that uses the Meganova API (`Bytedance/seedream-4-5-251128` model) for image generation. The tool will be server-side executed and conditionally enabled based on user preferences stored in `toolStore`.

## API Reference

```bash
POST https://api.meganova.ai/v1/images/generation
Authorization: Bearer $MEGANOVA_API_KEY
Content-Type: application/json

{
  "model": "Bytedance/seedream-4-5-251128",
  "prompt": "description of the image",
  "seed": -1,           # -1 for random
  "width": 1024,
  "height": 1024,
  "image": "https://..."  # optional: source image for image-to-image
}

Response: { "image": "<base64_data>" }
```

---

## Files to Create/Modify

### 1. Create `lib/ai/tools/generateImage.ts`

Define the generateImage tool following AI SDK patterns:

```typescript
import { tool } from "ai";
import { z } from "zod";

const MEGANOVA_API_URL = "https://api.meganova.ai/v1/images/generation";
const DEFAULT_MODEL = "Bytedance/seedream-4-5-251128";

export const generateImageTool = tool({
  description:
    "Generate an image from a text prompt using AI. Can also transform an existing image by providing a source image URL.",
  parameters: z.object({
    prompt: z.string().describe("Detailed description of the image to generate"),
    width: z.number().optional().default(1024).describe("Image width in pixels"),
    height: z.number().optional().default(1024).describe("Image height in pixels"),
    seed: z.number().optional().default(-1).describe("Seed for reproducibility (-1 for random)"),
    image: z.string().url().optional().describe("URL of source image for style transfer or image-to-image transformation"),
  }),
  execute: async ({ prompt, width, height, seed, image }) => {
    const apiKey = process.env.MEGANOVA_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        error: "MEGANOVA_API_KEY not configured",
        prompt,
      };
    }

    try {
      const response = await fetch(MEGANOVA_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          prompt,
          width,
          height,
          seed,
          ...(image && { image }),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Meganova API error: ${response.status} - ${errorText}`,
          prompt,
        };
      }

      const data = await response.json();

      return {
        success: true,
        image: {
          base64: data.image,
          mediaType: "image/png",
        },
        prompt,
        revisedPrompt: data.revised_prompt, // if Meganova returns this
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        prompt,
      };
    }
  },
});
```

### 2. Create `lib/ai/tools/index.ts`

Export all tools from a central location:

```typescript
export { generateImageTool } from "./generateImage";
```

### 3. Modify `app/api/chat/route.ts`

Add tools support to the chat API:

```typescript
// Add imports
import { generateImageTool } from "@/lib/ai/tools";

// Add to ChatRequest interface
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

// In POST handler, build tools object conditionally
const enabledTools = {
  ...(body.tools?.generateImage && { generateImage: generateImageTool }),
  // Future: add more tools here
};

const result = streamText({
  model: getModel(model),
  system: DEFAULT_SYSTEM_PROMPT,
  messages: await convertToModelMessages(messages),
  tools: Object.keys(enabledTools).length > 0 ? enabledTools : undefined,
});
```

### 4. Modify `config/defaults.ts`

Add instruction for image generation to the system prompt:

```typescript
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant.

## Available Tools

When the generateImage tool is available, use it when users ask you to:
- Create, draw, generate, or visualize images
- Make art, illustrations, or pictures
- Transform or modify existing images (provide the source image URL)

For image generation, write detailed, descriptive prompts that include:
- Subject and action
- Style (photorealistic, illustration, painting, etc.)
- Lighting and atmosphere
- Composition details
`;
```

### 5. Modify `hooks/chat/useChatMessages.ts`

Pass tool enablement flags to the server:

```typescript
// Add import
import { useToolStore } from "@/store/toolStore";

// Inside useChatMessages function
const { generateImageEnabled, generateVideoEnabled, webSearchEnabled } =
  useToolStore.getState();

// Update transport useMemo dependencies and body
const transport = useMemo(
  () =>
    new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages, id }) => ({
        body: {
          message: messages[messages.length - 1],
          sessionId: currentSessionId ?? id,
          model: selectedModelId,
          tools: {
            generateImage: generateImageEnabled,
            generateVideo: generateVideoEnabled,
            webSearch: webSearchEnabled,
          },
        },
      }),
    }),
  [currentSessionId, selectedModelId, generateImageEnabled, generateVideoEnabled, webSearchEnabled]
);
```

**Note**: Use `useToolStore.getState()` instead of the hook directly since this is inside a callback that needs fresh values, or restructure to pass as dependency.

### 6. Update `.env.example`

Add the Meganova API key:

```bash
# Meganova API (for image generation)
MEGANOVA_API_KEY=your_meganova_api_key_here
```

---

## Existing UI (No Changes Needed)

The following already exist and will work automatically:

- **Tool toggle UI**: `components/chat/ChatToolSelector.tsx` - toggles `generateImageEnabled` in store
- **Tool store**: `store/toolStore.ts` - persists user preferences
- **Tool rendering**: `components/chat/ChatInterface.tsx` - renders `tool-generateImage` parts with image display
- **Error display**: Tool errors shown natively in `ToolOutput` component (red background, error text)
- **Context display**: `components/ai-elements/context.tsx` - shows token usage (works with existing flow)

---

## Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              Data Flow                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. User types "Generate an image of a cat in space"                    │
│                                                                          │
│  2. useChatMessages reads toolStore.generateImageEnabled                │
│     └─► Sends { message, tools: { generateImage: true } }              │
│                                                                          │
│  3. /api/chat/route.ts receives request                                 │
│     └─► Builds tools object: { generateImage: generateImageTool }      │
│     └─► Calls streamText with tools                                     │
│                                                                          │
│  4. LLM decides to call generateImage tool                              │
│     └─► Tool execute() calls Meganova API                               │
│     └─► Returns { success, image: { base64, mediaType }, prompt }      │
│                                                                          │
│  5. Response streams back to client                                      │
│     └─► Message part: { type: "tool-generateImage", state, output }    │
│                                                                          │
│  6. ChatInterface renders the tool part                                  │
│     └─► If success: displays <Image base64={...} />                    │
│     └─► If error: displays error in ToolOutput component               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Error Handling

| Error Type | Handling |
|------------|----------|
| Missing API key | Return `{ success: false, error: "..." }` → shown in ToolOutput |
| API error (4xx/5xx) | Return `{ success: false, error: "..." }` → shown in ToolOutput |
| Network error | Caught in try/catch → shown in ToolOutput |
| Invalid image URL | Meganova will return error → shown in ToolOutput |

All tool errors display natively in the `ToolOutput` component with red styling. No toast needed for tool-specific errors.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `lib/ai/tools/generateImage.ts` | Create | Tool definition with Meganova API call |
| `lib/ai/tools/index.ts` | Create | Export all tools |
| `app/api/chat/route.ts` | Modify | Add tools to streamText |
| `config/defaults.ts` | Modify | Add tool instructions to system prompt |
| `hooks/chat/useChatMessages.ts` | Modify | Send tool flags in request body |
| `.env.example` | Modify | Add MEGANOVA_API_KEY |

---

## Future Enhancements (Out of Scope)

- File upload → temporary URL for image-to-image (currently URL-only)
- Multiple Meganova models selection
- Image size presets UI
- generateVideo and webSearch tools (same pattern)
