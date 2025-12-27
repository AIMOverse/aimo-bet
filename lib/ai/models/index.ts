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
  getModelSeries,
  getSeriesLogoPath,
  getModelSeriesMap,
  getModelsWithWallets,
} from "./catalog";

// Provider configurations
export { PROVIDERS, getProviderById, getDefaultProvider } from "./config";

// Provider instances
export { openrouter, aimo } from "./providers";

// Registry and model access
export { registry, getModel } from "./registry";
