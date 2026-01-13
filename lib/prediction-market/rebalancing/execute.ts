import { bridgeUSDCToPolygon } from "@/lib/prediction-market/polymarket/bridge";
import type { AgentSigners } from "@/lib/crypto/signers";
import { checkRebalanceNeeded } from "./check";
import {
  isBridgePending,
  markBridgePending,
  clearBridgePending,
} from "./tracking";
import type { BalanceState, RebalanceResult } from "./types";

/**
 * Check balances and trigger rebalance if needed.
 * Non-blocking - fires bridge async and returns immediately.
 */
export async function checkAndTriggerRebalance(
  modelId: string,
  signers: AgentSigners,
  balances: BalanceState
): Promise<RebalanceResult> {
  const logPrefix = `[rebalance:${modelId}]`;

  // 1. Check if rebalance is needed
  const check = checkRebalanceNeeded(balances);

  if (!check.needed) {
    console.log(`${logPrefix} No rebalance needed: ${check.reason}`);
    return { triggered: false, reason: check.reason };
  }

  // 2. Check if bridge already pending
  if (isBridgePending(modelId)) {
    console.log(`${logPrefix} Bridge already pending, skipping`);
    return { triggered: false, reason: "Bridge already pending" };
  }

  // 3. Validate signers
  if (!signers.svm || !signers.evm) {
    console.log(`${logPrefix} Missing signers for bridge`);
    return { triggered: false, reason: "Missing SVM or EVM signers" };
  }

  // 4. Mark as pending and trigger async bridge
  markBridgePending(modelId);
  console.log(
    `${logPrefix} Triggering bridge: $${check.amount} Solana -> Polygon`
  );

  // Fire and forget - don't await
  bridgeUSDCToPolygon(
    check.amount,
    signers.svm.keyPairSigner,
    signers.evm.address
  )
    .then((result) => {
      if (result.success) {
        console.log(`${logPrefix} Bridge completed: $${result.amountBridged}`);
      } else {
        console.error(`${logPrefix} Bridge failed: ${result.error}`);
      }
      clearBridgePending(modelId);
    })
    .catch((error) => {
      console.error(`${logPrefix} Bridge error:`, error);
      clearBridgePending(modelId);
    });

  return {
    triggered: true,
    direction: check.direction!,
    amount: check.amount,
    reason: check.reason,
  };
}
