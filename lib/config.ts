/**
 * Unified configuration for Alpha Arena
 */

// =============================================================================
// Default Values
// =============================================================================

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

// =============================================================================
// Arena Configuration
// =============================================================================

/** Default starting capital for new sessions */
export const DEFAULT_STARTING_CAPITAL = 10000;

/** Polling intervals in milliseconds */
export const POLLING_INTERVALS = {
  performance: 30000, // 30 seconds
  trades: 10000, // 10 seconds
  broadcasts: 10000, // 10 seconds
  positions: 30000, // 30 seconds
  session: 60000, // 60 seconds
  prices: 5000, // 5 seconds (for REST polling)
} as const;

/** Market categories */
export const MARKET_CATEGORIES = [
  "Politics",
  "Economics",
  "Sports",
  "Entertainment",
  "Science",
  "Technology",
  "Weather",
  "Finance",
] as const;

/** Chart configuration */
export const CHART_CONFIG = {
  height: 600,
  margin: { top: 20, right: 30, left: 20, bottom: 5 },
  animationDuration: 300,
} as const;

/** Trade feed configuration */
export const TRADE_FEED_CONFIG = {
  pageSize: 20,
  maxItems: 100,
} as const;

/** Broadcast feed configuration */
export const BROADCAST_FEED_CONFIG = {
  pageSize: 20,
  maxItems: 50,
} as const;
