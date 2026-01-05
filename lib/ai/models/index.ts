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
export {
  PROVIDERS,
  getProviderById,
  getDefaultProvider,
  type ProviderConfig,
} from "@/lib/config";

// Provider instances
export { openrouter, getAimoProvider, getAimoModel } from "./providers";

// Model access
export { getModel } from "./registry";
