import type { ArenaModel } from '@/types/arena';

// Default starting capital for new sessions
export const DEFAULT_STARTING_CAPITAL = 10000;

// Polling intervals in milliseconds
export const POLLING_INTERVALS = {
  performance: 30000, // 30 seconds
  trades: 10000, // 10 seconds
  broadcasts: 10000, // 10 seconds
  positions: 30000, // 30 seconds
  session: 60000, // 60 seconds
} as const;

// Chart colors for models
export const MODEL_COLORS = {
  'openai/gpt-4o': '#10b981', // Emerald
  'openai/gpt-4o-mini': '#22c55e', // Green
  'anthropic/claude-sonnet-4': '#f97316', // Orange
  'anthropic/claude-3.5-haiku': '#fb923c', // Amber
  'google/gemini-2.0-flash-001': '#3b82f6', // Blue
  'deepseek/deepseek-chat': '#8b5cf6', // Violet
  'meta-llama/llama-3.3-70b-instruct': '#ec4899', // Pink
  'mistralai/mistral-large-2411': '#06b6d4', // Cyan
} as const;

// Default chart color for new models
export const DEFAULT_CHART_COLOR = '#6366f1'; // Indigo

// Pre-seeded models for the arena
export const DEFAULT_ARENA_MODELS: Omit<ArenaModel, 'id' | 'createdAt'>[] = [
  {
    name: 'GPT-4o',
    provider: 'OpenRouter',
    modelIdentifier: 'openai/gpt-4o',
    chartColor: MODEL_COLORS['openai/gpt-4o'],
    enabled: true,
  },
  {
    name: 'GPT-4o Mini',
    provider: 'OpenRouter',
    modelIdentifier: 'openai/gpt-4o-mini',
    chartColor: MODEL_COLORS['openai/gpt-4o-mini'],
    enabled: true,
  },
  {
    name: 'Claude Sonnet 4',
    provider: 'OpenRouter',
    modelIdentifier: 'anthropic/claude-sonnet-4',
    chartColor: MODEL_COLORS['anthropic/claude-sonnet-4'],
    enabled: true,
  },
  {
    name: 'Claude 3.5 Haiku',
    provider: 'OpenRouter',
    modelIdentifier: 'anthropic/claude-3.5-haiku',
    chartColor: MODEL_COLORS['anthropic/claude-3.5-haiku'],
    enabled: true,
  },
  {
    name: 'Gemini 2.0 Flash',
    provider: 'OpenRouter',
    modelIdentifier: 'google/gemini-2.0-flash-001',
    chartColor: MODEL_COLORS['google/gemini-2.0-flash-001'],
    enabled: true,
  },
  {
    name: 'DeepSeek Chat',
    provider: 'OpenRouter',
    modelIdentifier: 'deepseek/deepseek-chat',
    chartColor: MODEL_COLORS['deepseek/deepseek-chat'],
    enabled: true,
  },
  {
    name: 'Llama 3.3 70B',
    provider: 'OpenRouter',
    modelIdentifier: 'meta-llama/llama-3.3-70b-instruct',
    chartColor: MODEL_COLORS['meta-llama/llama-3.3-70b-instruct'],
    enabled: true,
  },
  {
    name: 'Mistral Large',
    provider: 'OpenRouter',
    modelIdentifier: 'mistralai/mistral-large-2411',
    chartColor: MODEL_COLORS['mistralai/mistral-large-2411'],
    enabled: true,
  },
];

// Market categories
export const MARKET_CATEGORIES = [
  'Politics',
  'Economics',
  'Sports',
  'Entertainment',
  'Science',
  'Technology',
  'Weather',
  'Finance',
] as const;

// Chart configuration
export const CHART_CONFIG = {
  height: 400,
  margin: { top: 20, right: 30, left: 20, bottom: 5 },
  animationDuration: 300,
} as const;

// Trade feed configuration
export const TRADE_FEED_CONFIG = {
  pageSize: 20,
  maxItems: 100,
} as const;

// Broadcast feed configuration
export const BROADCAST_FEED_CONFIG = {
  pageSize: 20,
  maxItems: 50,
} as const;
