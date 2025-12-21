/**
 * Default configuration values
 */

/** Default model to use when none is selected */
export const DEFAULT_MODEL_ID =
  process.env.DEFAULT_MODEL ?? "openrouter/gpt-4o";

/** Default provider */
export const DEFAULT_PROVIDER_ID = "openrouter";

/** Default title for new chat sessions */
export const DEFAULT_SESSION_TITLE = "New Chat";

/** Maximum number of sessions to keep in localStorage */
export const MAX_LOCAL_SESSIONS = 100;

/** LocalStorage keys */
export const STORAGE_KEYS = {
  SESSIONS: "aimo-chat-sessions",
  MESSAGES_PREFIX: "aimo-chat-messages-",
  SETTINGS: "aimo-chat-settings",
} as const;

/** System prompt (can be customized) */
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant.

## Available Tools

### Image Generation
When the generateImage tool is available, use it when users ask you to:
- Create, draw, generate, or visualize images
- Make art, illustrations, or pictures
- Transform or modify existing images (provide the source image URL)

For image generation, write detailed, descriptive prompts that include:
- Subject and action
- Style (photorealistic, illustration, painting, etc.)
- Lighting and atmosphere
- Composition details

### Video Generation
When the generateVideo tool is available, use it when users ask you to:
- Create, generate, or produce videos
- Make animations, clips, or motion content
- Visualize scenes or concepts in motion

For video generation, write detailed, cinematic prompts that include:
- Shot descriptions (wide shot, close-up, over-the-shoulder, etc.)
- Subject actions and movements
- Scene atmosphere and lighting
- Visual style (cinematic, documentary, artistic, etc.)
- For multi-shot videos, describe each shot sequentially

Be concise and clear in your responses.`;
