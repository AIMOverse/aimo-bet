// ============================================================================
// Polymarket Allowance Management
// Handles USDC approval and CTF (Conditional Token) approval for trading
// - USDC approval: Required for buying (spend USDC to get tokens)
// - CTF approval: Required for selling (spend tokens to get USDC)
// ============================================================================

import { maxUint256 } from "viem";
import { polygon } from "viem/chains";
import {
  getPublicClient,
  getWalletClient,
  type PolygonWallet,
} from "@/lib/crypto/polygon/client";
import { POLYGON_USDC_ADDRESS } from "@/lib/config";
import type { ClobClient } from "@polymarket/clob-client";

// ============================================================================
// Constants
// ============================================================================

/** Conditional Tokens (CTF) contract address on Polygon */
const CTF_CONTRACT = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";

/** Polymarket contracts that need USDC approval (for buying) */
export const POLYMARKET_USDC_SPENDERS = [
  "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E", // CTF Exchange
  "0xC5d563A36AE78145C45a50134d48A1215220f80a", // Neg Risk CTF Exchange
  "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296", // Neg Risk Adapter
] as const;

/** Polymarket contracts that need CTF approval (for selling) */
export const POLYMARKET_CTF_OPERATORS = [
  "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E", // CTF Exchange
  "0xC5d563A36AE78145C45a50134d48A1215220f80a", // Neg Risk CTF Exchange
  "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296", // Neg Risk Adapter
] as const;

/** Minimum USDC allowance threshold before auto-approving (1000 USDC) */
const MIN_USDC_ALLOWANCE = 1000n * 1_000_000n; // 1000 USDC in 6 decimals

/** ERC20 ABI for USDC allowance operations */
const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** ERC1155 ABI for CTF approval operations */
const ERC1155_ABI = [
  {
    name: "setApprovalForAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "isApprovedForAll",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ============================================================================
// State
// ============================================================================

/**
 * Cache of wallets that have been verified to have all approvals set.
 * Key: wallet address (lowercase)
 * Value: true if all USDC and CTF approvals are set
 */
const fullyApprovedWallets = new Set<string>();

// ============================================================================
// Types
// ============================================================================

export interface AllowanceStatus {
  /** Whether all approvals are set */
  hasAllowance: boolean;
  /** USDC spenders that need approval */
  usdcNeedsApproval: string[];
  /** CTF operators that need approval */
  ctfNeedsApproval: string[];
  /** USDC spenders already approved */
  usdcApproved: string[];
  /** CTF operators already approved */
  ctfApproved: string[];
}

export interface ApprovalResult {
  success: boolean;
  usdcApproved: string[];
  ctfApproved: string[];
  failed: Array<{ contract: string; type: "usdc" | "ctf"; error: string }>;
  txHashes: string[];
}

// ============================================================================
// Check Functions
// ============================================================================

/**
 * Check USDC allowance for all Polymarket spender contracts.
 */
async function checkUsdcAllowances(
  walletAddress: string
): Promise<{ approved: string[]; needsApproval: string[] }> {
  const publicClient = getPublicClient();
  const approved: string[] = [];
  const needsApproval: string[] = [];

  for (const spender of POLYMARKET_USDC_SPENDERS) {
    try {
      const allowance = await publicClient.readContract({
        address: POLYGON_USDC_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [walletAddress as `0x${string}`, spender],
      });

      if (allowance >= MIN_USDC_ALLOWANCE) {
        approved.push(spender);
      } else {
        needsApproval.push(spender);
      }
    } catch (error) {
      console.error(
        `[polymarket/allowance] Error checking USDC allowance for ${spender}:`,
        error
      );
      needsApproval.push(spender);
    }
  }

  return { approved, needsApproval };
}

/**
 * Check CTF (ERC1155) approval for all Polymarket operator contracts.
 */
async function checkCtfApprovals(
  walletAddress: string
): Promise<{ approved: string[]; needsApproval: string[] }> {
  const publicClient = getPublicClient();
  const approved: string[] = [];
  const needsApproval: string[] = [];

  for (const operator of POLYMARKET_CTF_OPERATORS) {
    try {
      const isApproved = await publicClient.readContract({
        address: CTF_CONTRACT as `0x${string}`,
        abi: ERC1155_ABI,
        functionName: "isApprovedForAll",
        args: [walletAddress as `0x${string}`, operator],
      });

      if (isApproved) {
        approved.push(operator);
      } else {
        needsApproval.push(operator);
      }
    } catch (error) {
      console.error(
        `[polymarket/allowance] Error checking CTF approval for ${operator}:`,
        error
      );
      needsApproval.push(operator);
    }
  }

  return { approved, needsApproval };
}

/**
 * Check all allowances (USDC + CTF) for a wallet.
 * Uses cached state to avoid repeated RPC calls.
 *
 * @param walletAddress - Wallet address to check
 * @param forceRefresh - Skip cache and check on-chain
 * @returns Combined allowance status
 */
export async function checkAllowance(
  walletAddress: string,
  forceRefresh = false
): Promise<AllowanceStatus> {
  const normalizedAddress = walletAddress.toLowerCase();

  // Check cache first
  if (!forceRefresh && fullyApprovedWallets.has(normalizedAddress)) {
    return {
      hasAllowance: true,
      usdcNeedsApproval: [],
      ctfNeedsApproval: [],
      usdcApproved: [...POLYMARKET_USDC_SPENDERS],
      ctfApproved: [...POLYMARKET_CTF_OPERATORS],
    };
  }

  // Check both USDC and CTF allowances in parallel
  const [usdcStatus, ctfStatus] = await Promise.all([
    checkUsdcAllowances(walletAddress),
    checkCtfApprovals(walletAddress),
  ]);

  const hasAllowance =
    usdcStatus.needsApproval.length === 0 &&
    ctfStatus.needsApproval.length === 0;

  // Update cache if fully approved
  if (hasAllowance) {
    fullyApprovedWallets.add(normalizedAddress);
  }

  return {
    hasAllowance,
    usdcNeedsApproval: usdcStatus.needsApproval,
    ctfNeedsApproval: ctfStatus.needsApproval,
    usdcApproved: usdcStatus.approved,
    ctfApproved: ctfStatus.approved,
  };
}

// ============================================================================
// Approval Functions
// ============================================================================

/**
 * Approve all Polymarket contracts for both USDC and CTF.
 * Only approves contracts that need it.
 *
 * @param wallet - Polygon wallet to approve from
 * @returns Result of approval operations
 */
export async function approveAllContracts(
  wallet: PolygonWallet
): Promise<ApprovalResult> {
  const logPrefix = "[polymarket/allowance]";

  // Check which contracts need approval
  const status = await checkAllowance(wallet.address, true);

  if (status.hasAllowance) {
    console.log(
      `${logPrefix} All contracts already approved for ${wallet.address.slice(
        0,
        10
      )}...`
    );
    return {
      success: true,
      usdcApproved: status.usdcApproved,
      ctfApproved: status.ctfApproved,
      failed: [],
      txHashes: [],
    };
  }

  const publicClient = getPublicClient();
  const walletClient = getWalletClient(wallet._viemAccount);

  const usdcApproved: string[] = [...status.usdcApproved];
  const ctfApproved: string[] = [...status.ctfApproved];
  const failed: Array<{
    contract: string;
    type: "usdc" | "ctf";
    error: string;
  }> = [];
  const txHashes: string[] = [];

  const totalNeeded =
    status.usdcNeedsApproval.length + status.ctfNeedsApproval.length;
  console.log(
    `${logPrefix} Approving ${totalNeeded} contracts for ${wallet.address.slice(
      0,
      10
    )}...`
  );

  // Approve USDC spenders
  for (const spender of status.usdcNeedsApproval) {
    try {
      console.log(`${logPrefix} Approving USDC for ${spender}...`);

      const hash = await walletClient.writeContract({
        account: wallet._viemAccount,
        chain: polygon,
        address: POLYGON_USDC_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender as `0x${string}`, maxUint256],
      });

      console.log(`${logPrefix} TX submitted: ${hash}`);
      txHashes.push(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`${logPrefix} Confirmed in block ${receipt.blockNumber}`);

      usdcApproved.push(spender);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `${logPrefix} Failed to approve USDC for ${spender}:`,
        errorMsg
      );
      failed.push({ contract: spender, type: "usdc", error: errorMsg });
    }
  }

  // Approve CTF operators (setApprovalForAll)
  for (const operator of status.ctfNeedsApproval) {
    try {
      console.log(`${logPrefix} Approving CTF for ${operator}...`);

      const hash = await walletClient.writeContract({
        account: wallet._viemAccount,
        chain: polygon,
        address: CTF_CONTRACT as `0x${string}`,
        abi: ERC1155_ABI,
        functionName: "setApprovalForAll",
        args: [operator as `0x${string}`, true],
      });

      console.log(`${logPrefix} TX submitted: ${hash}`);
      txHashes.push(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`${logPrefix} Confirmed in block ${receipt.blockNumber}`);

      ctfApproved.push(operator);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `${logPrefix} Failed to approve CTF for ${operator}:`,
        errorMsg
      );
      failed.push({ contract: operator, type: "ctf", error: errorMsg });
    }
  }

  const success = failed.length === 0;

  // Update cache if all approved
  if (success) {
    fullyApprovedWallets.add(wallet.address.toLowerCase());
  }

  return { success, usdcApproved, ctfApproved, failed, txHashes };
}

/**
 * Ensure wallet has all necessary approvals set, approving if necessary.
 * This is the main entry point - call before any trade.
 *
 * Handles:
 * - USDC approval for buying (ERC20 approve)
 * - CTF approval for selling (ERC1155 setApprovalForAll)
 *
 * @param wallet - Polygon wallet
 * @param clobClient - Optional CLOB client to update allowance cache
 * @returns Whether all approvals are set (after potential approval)
 */
export async function ensureAllowance(
  wallet: PolygonWallet,
  clobClient?: ClobClient
): Promise<{
  success: boolean;
  wasApprovalNeeded: boolean;
  error?: string;
}> {
  const logPrefix = "[polymarket/allowance]";

  // Check current allowance
  const status = await checkAllowance(wallet.address);

  if (status.hasAllowance) {
    return { success: true, wasApprovalNeeded: false };
  }

  console.log(
    `${logPrefix} Approvals needed: ${status.usdcNeedsApproval.length} USDC, ${status.ctfNeedsApproval.length} CTF`
  );

  // Attempt to approve
  const result = await approveAllContracts(wallet);

  if (!result.success) {
    const failedContracts = result.failed
      .map((f) => `${f.type}:${f.contract.slice(0, 10)}`)
      .join(", ");
    return {
      success: false,
      wasApprovalNeeded: true,
      error: `Failed to approve contracts: ${failedContracts}. Check POL balance for gas.`,
    };
  }

  // Update Polymarket's internal allowance cache if client provided
  if (clobClient) {
    try {
      await clobClient.updateBalanceAllowance({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        asset_type: "COLLATERAL" as any,
      });
      console.log(`${logPrefix} Updated Polymarket allowance cache`);
    } catch (error) {
      // Non-fatal - allowance is already set on-chain
      console.warn(
        `${logPrefix} Failed to update Polymarket cache (non-fatal):`,
        error
      );
    }
  }

  return { success: true, wasApprovalNeeded: true };
}

/**
 * Clear the approval cache for a wallet.
 * Useful when troubleshooting or after revoking approvals.
 */
export function clearApprovalCache(walletAddress?: string): void {
  if (walletAddress) {
    fullyApprovedWallets.delete(walletAddress.toLowerCase());
  } else {
    fullyApprovedWallets.clear();
  }
}
