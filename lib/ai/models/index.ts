// ============================================================================
// Unified Models Module
// ============================================================================

// Model catalog and helpers
export {
  MODELS,
  getModelById,
  getModelsByProvider,
  DEFAULT_CHART_COLOR,
  getArenaModels,
  getArenaModel,
  getArenaModelByShortId,
  getModelColor,
  getModelColorMap,
  getModelsWithWallets,
} from "./catalog";

// Provider configurations
export { PROVIDERS, getProviderById, getDefaultProvider } from "./providers";

// Provider instances
export { openrouter } from "./openrouter";
export { aimo } from "./aimo";

// Registry and model access
export { registry, getModel } from "./registry";
