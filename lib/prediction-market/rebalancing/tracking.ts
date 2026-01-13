import { REBALANCE_CONFIG } from "./config";

/**
 * In-memory tracking for pending bridge operations.
 * Prevents duplicate bridges while one is in flight.
 *
 * Note: For multi-instance deployments, upgrade to Redis.
 */
const pendingBridges = new Map<string, number>(); // modelId -> timestamp

/**
 * Check if a bridge is already pending for this model
 */
export function isBridgePending(modelId: string): boolean {
  const timestamp = pendingBridges.get(modelId);
  if (!timestamp) return false;

  // Check if TTL expired
  if (Date.now() - timestamp > REBALANCE_CONFIG.PENDING_BRIDGE_TTL) {
    pendingBridges.delete(modelId);
    return false;
  }

  return true;
}

/**
 * Mark a bridge as pending
 */
export function markBridgePending(modelId: string): void {
  pendingBridges.set(modelId, Date.now());
}

/**
 * Clear pending bridge flag (call when bridge completes or fails definitively)
 */
export function clearBridgePending(modelId: string): void {
  pendingBridges.delete(modelId);
}
