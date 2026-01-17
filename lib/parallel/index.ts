// ============================================================================
// Parallel AI Module
// Search API, Task API (research), and Monitor API (news tracking)
// ============================================================================

// Client functions
export {
  search,
  createResearchTask,
  getTaskStatus,
  createMonitor,
  getMonitor,
  listMonitors,
  deleteMonitor,
  getMonitorEventGroup,
  simulateMonitorEvent,
} from "./client";

// Types
export type {
  Processor,
  SearchResult,
  TaskRunResponse,
  TaskStatus,
  FieldBasis,
  WebhookPayload,
  ResearchResult,
  MonitorCadence,
  MonitorStatus,
  MonitorEventType,
  MonitorConfig,
  MonitorCreateResponse,
  MonitorEvent,
  MonitorEventGroup,
  MonitorWebhookPayload,
  MonitorDetails,
  MonitorListResponse,
} from "./types";

// Monitor configuration
export {
  MONITORS,
  getEnabledMonitors,
  getMonitorById,
  getMonitorsByCategory,
  getMonitorsByCadence,
  type MonitorDefinition,
} from "./monitors";
