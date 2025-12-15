import type { ProviderConfig } from "@/types/models";

/**
 * API provider configurations
 */
export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modelsEndpoint: "/models",
    envKey: "OPENAI_API_KEY",
  },
  // Future providers can be added here:
  // {
  //   id: "openrouter",
  //   name: "OpenRouter",
  //   baseUrl: "https://openrouter.ai/api/v1",
  //   modelsEndpoint: "/models",
  //   envKey: "OPENROUTER_API_KEY",
  // },
  // {
  //   id: "anthropic",
  //   name: "Anthropic",
  //   baseUrl: "https://api.anthropic.com/v1",
  //   envKey: "ANTHROPIC_API_KEY",
  // },
];

/**
 * Get provider by ID
 */
export function getProviderById(id: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Get default provider
 */
export function getDefaultProvider(): ProviderConfig {
  return PROVIDERS[0];
}
