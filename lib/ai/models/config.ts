import type { ProviderConfig } from "./types";

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * API provider configurations
 */
export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    modelsEndpoint: "/models",
    envKey: "OPENROUTER_API_KEY",
  },
  {
    id: "aimo",
    name: "AiMo",
    baseUrl: "https://api.aimo.ai/v1",
    envKey: "AIMO_API_KEY",
  },
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
