// ============================================================================
// Manual Bridge Service
// Vault-based cross-chain USDC bridging without external bridge services
//
// Architecture:
// - Two vaults: one on Solana (SVM), one on Polygon (EVM)
// - Each vault holds USDC + native tokens for gas
// - To bridge Polygon → Solana: agent sends USDC.e to EVM vault, SVM vault sends USDC to agent
// - To bridge Solana → Polygon: agent sends USDC to SVM vault, EVM vault sends USDC.e to agent
// ============================================================================

import type { KeyPairSigner } from "@solana/kit";
import {
  BRIDGE_VAULT_SVM_PRIVATE_KEY,
  BRIDGE_VAULT_EVM_PRIVATE_KEY,
} from "@/lib/config";
import { createSignerFromBase58SecretKey } from "@/lib/crypto/solana/wallets";
import {
  createPolygonWallet,
  type PolygonWallet,
} from "@/lib/crypto/polygon/client";
import {
  getCurrencyBalance,
  getSolBalance,
  TOKEN_MINTS,
} from "@/lib/crypto/solana/client";
import {
  getUsdcBalance,
  getPolBalance,
  sendUsdcPolygon,
} from "@/lib/crypto/polygon/client";
import { sendUSDC } from "@/lib/crypto/solana/transfer";
import { getSponsorSigner } from "@/lib/crypto/solana/sponsor";

// ============================================================================
// Types
// ============================================================================

export interface BridgeResult {
  /** Whether the bridge completed successfully */
  success: boolean;
  /** Source chain transaction hash/signature */
  sourceTxHash: string;
  /** Destination chain transaction hash/signature */
  destinationTxHash?: string;
  /** Amount bridged (in USDC) */
  amountBridged: number;
  /** Error message if failed */
  error?: string;
}

export interface VaultBalances {
  svm: {
    address: string;
    usdc: number;
    sol: number;
  };
  evm: {
    address: string;
    usdc: number;
    pol: number;
  };
}

// ============================================================================
// Vault Signer Management
// ============================================================================

let cachedSvmVaultSigner: KeyPairSigner | null = null;
let cachedEvmVaultWallet: PolygonWallet | null = null;

/**
 * Get the SVM (Solana) vault signer
 */
export async function getSvmVaultSigner(): Promise<KeyPairSigner | null> {
  if (cachedSvmVaultSigner) return cachedSvmVaultSigner;

  if (!BRIDGE_VAULT_SVM_PRIVATE_KEY) {
    console.warn("[manualBridge] BRIDGE_VAULT_SVM_PRIVATE_KEY not configured");
    return null;
  }

  cachedSvmVaultSigner = await createSignerFromBase58SecretKey(
    BRIDGE_VAULT_SVM_PRIVATE_KEY
  );
  return cachedSvmVaultSigner;
}

/**
 * Get the EVM (Polygon) vault wallet
 */
export function getEvmVaultWallet(): PolygonWallet | null {
  if (cachedEvmVaultWallet) return cachedEvmVaultWallet;

  if (!BRIDGE_VAULT_EVM_PRIVATE_KEY) {
    console.warn("[manualBridge] BRIDGE_VAULT_EVM_PRIVATE_KEY not configured");
    return null;
  }

  cachedEvmVaultWallet = createPolygonWallet(BRIDGE_VAULT_EVM_PRIVATE_KEY);
  return cachedEvmVaultWallet;
}

// ============================================================================
// Vault Balance Queries
// ============================================================================

/**
 * Get current balances of both bridge vaults
 * Useful for monitoring vault liquidity
 */
export async function getVaultBalances(): Promise<VaultBalances | null> {
  const logPrefix = "[manualBridge]";

  const svmVault = await getSvmVaultSigner();
  const evmVault = getEvmVaultWallet();

  if (!svmVault || !evmVault) {
    console.error(`${logPrefix} Vault signers not configured`);
    return null;
  }

  try {
    // Fetch all balances in parallel
    const [svmUsdc, svmSol, evmUsdc, evmPol] = await Promise.all([
      getCurrencyBalance(svmVault.address, "USDC"),
      getSolBalance(svmVault.address),
      getUsdcBalance(evmVault.address),
      getPolBalance(evmVault.address),
    ]);

    return {
      svm: {
        address: svmVault.address,
        usdc: svmUsdc ? Number(svmUsdc.formatted) : 0,
        sol: svmSol ? Number(svmSol.sol) : 0,
      },
      evm: {
        address: evmVault.address,
        usdc: evmUsdc?.balance ?? 0,
        pol: evmPol?.balance ?? 0,
      },
    };
  } catch (error) {
    console.error(`${logPrefix} Failed to fetch vault balances:`, error);
    return null;
  }
}

// ============================================================================
// Bridge Functions
// ============================================================================

/**
 * Bridge USDC.e from Polygon to Solana via manual vault transfer.
 *
 * Flow:
 * 1. Agent sends USDC.e to EVM vault address
 * 2. After confirmation, SVM vault sends equivalent USDC to agent's Solana wallet
 *
 * @param amount - Amount in USDC to bridge
 * @param agentEvmWallet - Agent's Polygon wallet (sender)
 * @param agentSvmAddress - Agent's Solana wallet address (recipient)
 * @returns Bridge result with transaction hashes
 */
export async function bridgePolygonToSolana(
  amount: number,
  agentEvmWallet: PolygonWallet,
  agentSvmAddress: string
): Promise<BridgeResult> {
  const logPrefix = "[manualBridge:P→S]";

  console.log(`${logPrefix} Bridging $${amount} from Polygon to Solana`);
  console.log(`${logPrefix} From: ${agentEvmWallet.address} (Polygon)`);
  console.log(`${logPrefix} To: ${agentSvmAddress} (Solana)`);

  // 1. Get vault signers
  const svmVault = await getSvmVaultSigner();
  const evmVault = getEvmVaultWallet();

  if (!svmVault || !evmVault) {
    return {
      success: false,
      sourceTxHash: "",
      amountBridged: 0,
      error:
        "Bridge vaults not configured. Set BRIDGE_VAULT_SVM_PRIVATE_KEY and BRIDGE_VAULT_EVM_PRIVATE_KEY.",
    };
  }

  // 2. Check SVM vault has enough USDC to fulfill the bridge
  const svmVaultBalance = await getCurrencyBalance(svmVault.address, "USDC");
  const svmVaultUsdc = svmVaultBalance ? Number(svmVaultBalance.formatted) : 0;

  if (svmVaultUsdc < amount) {
    return {
      success: false,
      sourceTxHash: "",
      amountBridged: 0,
      error: `SVM vault has insufficient USDC. Have: $${svmVaultUsdc.toFixed(
        2
      )}, Need: $${amount}`,
    };
  }

  // 3. Agent sends USDC.e to EVM vault
  console.log(
    `${logPrefix} Step 1: Agent sending $${amount} USDC.e to EVM vault...`
  );

  const sendResult = await sendUsdcPolygon(
    agentEvmWallet,
    evmVault.address,
    amount
  );

  if (!sendResult.success) {
    return {
      success: false,
      sourceTxHash: "",
      amountBridged: 0,
      error: `Failed to send to EVM vault: ${sendResult.error}`,
    };
  }

  console.log(`${logPrefix} Step 1 complete: ${sendResult.txHash}`);

  // 4. SVM vault sends USDC to agent's Solana address
  console.log(
    `${logPrefix} Step 2: SVM vault sending $${amount} USDC to agent...`
  );

  const vaultSendResult = await sendUSDC(svmVault, agentSvmAddress, amount);

  if (!vaultSendResult.success) {
    // This is problematic - agent sent funds but vault failed
    // In production, you'd want recovery/retry logic here
    console.error(`${logPrefix} CRITICAL: Agent paid but vault send failed!`);
    return {
      success: false,
      sourceTxHash: sendResult.txHash || "",
      amountBridged: 0,
      error: `Vault send failed after agent payment: ${vaultSendResult.error}. Source tx: ${sendResult.txHash}`,
    };
  }

  console.log(`${logPrefix} Step 2 complete: ${vaultSendResult.signature}`);
  console.log(`${logPrefix} Bridge complete! $${amount} transferred`);

  return {
    success: true,
    sourceTxHash: sendResult.txHash || "",
    destinationTxHash: vaultSendResult.signature,
    amountBridged: amount,
  };
}

/**
 * Bridge USDC from Solana to Polygon via manual vault transfer.
 *
 * Flow:
 * 1. Agent sends USDC to SVM vault address
 * 2. After confirmation, EVM vault sends equivalent USDC.e to agent's Polygon wallet
 *
 * @param amount - Amount in USDC to bridge
 * @param agentSvmSigner - Agent's Solana signer (sender)
 * @param agentEvmAddress - Agent's Polygon wallet address (recipient)
 * @returns Bridge result with transaction hashes
 */
export async function bridgeSolanaToPolygon(
  amount: number,
  agentSvmSigner: KeyPairSigner,
  agentEvmAddress: string
): Promise<BridgeResult> {
  const logPrefix = "[manualBridge:S→P]";

  console.log(`${logPrefix} Bridging $${amount} from Solana to Polygon`);
  console.log(`${logPrefix} From: ${agentSvmSigner.address} (Solana)`);
  console.log(`${logPrefix} To: ${agentEvmAddress} (Polygon)`);

  // 1. Get vault signers
  const svmVault = await getSvmVaultSigner();
  const evmVault = getEvmVaultWallet();

  if (!svmVault || !evmVault) {
    return {
      success: false,
      sourceTxHash: "",
      amountBridged: 0,
      error:
        "Bridge vaults not configured. Set BRIDGE_VAULT_SVM_PRIVATE_KEY and BRIDGE_VAULT_EVM_PRIVATE_KEY.",
    };
  }

  // 2. Check EVM vault has enough USDC.e to fulfill the bridge
  const evmVaultBalance = await getUsdcBalance(evmVault.address);
  const evmVaultUsdc = evmVaultBalance?.balance ?? 0;

  if (evmVaultUsdc < amount) {
    return {
      success: false,
      sourceTxHash: "",
      amountBridged: 0,
      error: `EVM vault has insufficient USDC.e. Have: $${evmVaultUsdc.toFixed(
        2
      )}, Need: $${amount}`,
    };
  }

  // 3. Get gas sponsor for fee sponsorship
  const sponsorSigner = await getSponsorSigner();
  if (sponsorSigner) {
    console.log(`${logPrefix} Gas sponsored by: ${sponsorSigner.address}`);
  }

  // 4. Agent sends USDC to SVM vault (with gas sponsoring)
  console.log(
    `${logPrefix} Step 1: Agent sending $${amount} USDC to SVM vault...`
  );

  const sendResult = await sendUSDC(
    agentSvmSigner,
    svmVault.address,
    amount,
    sponsorSigner ?? undefined
  );

  if (!sendResult.success) {
    return {
      success: false,
      sourceTxHash: "",
      amountBridged: 0,
      error: `Failed to send to SVM vault: ${sendResult.error}`,
    };
  }

  console.log(`${logPrefix} Step 1 complete: ${sendResult.signature}`);

  // 5. EVM vault sends USDC.e to agent's Polygon address
  console.log(
    `${logPrefix} Step 2: EVM vault sending $${amount} USDC.e to agent...`
  );

  const vaultSendResult = await sendUsdcPolygon(
    evmVault,
    agentEvmAddress,
    amount
  );

  if (!vaultSendResult.success) {
    // This is problematic - agent sent funds but vault failed
    // In production, you'd want recovery/retry logic here
    console.error(`${logPrefix} CRITICAL: Agent paid but vault send failed!`);
    return {
      success: false,
      sourceTxHash: sendResult.signature || "",
      amountBridged: 0,
      error: `Vault send failed after agent payment: ${vaultSendResult.error}. Source tx: ${sendResult.signature}`,
    };
  }

  console.log(`${logPrefix} Step 2 complete: ${vaultSendResult.txHash}`);
  console.log(`${logPrefix} Bridge complete! $${amount} transferred`);

  return {
    success: true,
    sourceTxHash: sendResult.signature || "",
    destinationTxHash: vaultSendResult.txHash,
    amountBridged: amount,
  };
}
