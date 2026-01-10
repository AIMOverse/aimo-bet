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

// Provider instances
export { getAimoProvider, getAimoModel } from "./providers";

// Model access
export { getModel } from "./registry";
