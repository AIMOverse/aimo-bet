import { NextRequest, NextResponse } from "next/server";
import { getGlobalSession } from "@/lib/supabase/db";
import { updateAllAgentBalances } from "@/lib/supabase/agents";
import { getModelsWithWallets, MODELS } from "@/lib/ai/models/catalog";
import { getCurrencyBalance, getSolBalance } from "@/lib/crypto/solana/client";
import { getUsdcBalance, getPolBalance } from "@/lib/crypto/polygon/client";
import { getVaultBalances } from "@/lib/prediction-market/rebalancing/manualBridge";

// ============================================================================
// Agent Balances Cron Endpoint
// ============================================================================
// GET /api/agents/balances - Update all agent balances from on-chain data
//
// Authentication: Requires CRON_SECRET in Authorization header.
//
// This endpoint fetches USDC balances from Solana for all agents and updates
// the database. It also checks EVM wallet balances and vault liquidity.
// Uses wallet addresses from env vars (via catalog) for accuracy.
//
// Warnings are logged if:
// - SVM vault has < 0.05 SOL or < 20 USDC
// - EVM vault has < 10 POL or < 20 USDC
// - Any agent wallet has < 2 POL
//
// Configure cron in vercel.json:
// {
//   "crons": [
//     { "path": "/api/agents/balances", "schedule": "*/5 * * * *" }
//   ]
// }
// ============================================================================

// Thresholds for balance warnings
const THRESHOLDS = {
  SVM_VAULT_SOL: 0.05,
  SVM_VAULT_USDC: 20,
  EVM_VAULT_POL: 10,
  EVM_VAULT_USDC: 20,
  AGENT_POL: 2,
};

/**
 * EVM public address environment variable mapping.
 * Maps model series to corresponding EVM public address env var.
 */
const EVM_PUBLIC_ADDRESS_MAP: Record<string, string | undefined> = {
  gpt: process.env.WALLET_GPT_EVM_PUBLIC,
  claude: process.env.WALLET_CLAUDE_EVM_PUBLIC,
  deepseek: process.env.WALLET_DEEPSEEK_EVM_PUBLIC,
  glm: process.env.WALLET_GLM_EVM_PUBLIC,
  grok: process.env.WALLET_GROK_EVM_PUBLIC,
  qwen: process.env.WALLET_QWEN_EVM_PUBLIC,
  gemini: process.env.WALLET_GEMINI_EVM_PUBLIC,
  kimi: process.env.WALLET_KIMI_EVM_PUBLIC,
};

interface AgentEvmBalance {
  modelId: string;
  series: string;
  evmAddress: string;
  usdc: number;
  pol: number;
}

interface VaultWarning {
  vault: "svm" | "evm";
  type: "sol" | "usdc" | "pol";
  current: number;
  threshold: number;
  message: string;
}

interface AgentWarning {
  modelId: string;
  series: string;
  type: "pol";
  current: number;
  threshold: number;
  message: string;
}

/**
 * Fetch USDC balance from Solana for a wallet address
 */
async function fetchSvmBalance(walletAddress: string): Promise<number | null> {
  const result = await getCurrencyBalance(walletAddress, "USDC");
  if (result === null) return null;
  return Number(result.formatted);
}

/**
 * Fetch EVM balances for all agent wallets
 */
async function fetchAgentEvmBalances(): Promise<AgentEvmBalance[]> {
  const logPrefix = "[agents/balances]";
  const results: AgentEvmBalance[] = [];

  // Get all enabled models with their series
  const models = MODELS.filter((m) => m.enabled && m.series);

  for (const model of models) {
    const series = model.series!;
    const evmAddress = EVM_PUBLIC_ADDRESS_MAP[series];

    if (!evmAddress) {
      console.log(`${logPrefix} No EVM address for ${series}, skipping`);
      continue;
    }

    try {
      const [usdcResult, polResult] = await Promise.all([
        getUsdcBalance(evmAddress),
        getPolBalance(evmAddress),
      ]);

      results.push({
        modelId: model.id,
        series,
        evmAddress,
        usdc: usdcResult?.balance ?? 0,
        pol: polResult?.balance ?? 0,
      });
    } catch (error) {
      console.error(
        `${logPrefix} Error fetching EVM balance for ${series}:`,
        error
      );
    }
  }

  return results;
}

/**
 * Check vault balances and return warnings
 */
async function checkVaultBalances(): Promise<{
  vaults: Awaited<ReturnType<typeof getVaultBalances>>;
  warnings: VaultWarning[];
}> {
  const logPrefix = "[agents/balances]";
  const warnings: VaultWarning[] = [];

  const vaults = await getVaultBalances();

  if (!vaults) {
    console.warn(`${logPrefix} Could not fetch vault balances`);
    return { vaults: null, warnings };
  }

  // Check SVM vault
  if (vaults.svm.sol < THRESHOLDS.SVM_VAULT_SOL) {
    warnings.push({
      vault: "svm",
      type: "sol",
      current: vaults.svm.sol,
      threshold: THRESHOLDS.SVM_VAULT_SOL,
      message: `SVM vault SOL is low: ${vaults.svm.sol.toFixed(
        4
      )} SOL (threshold: ${THRESHOLDS.SVM_VAULT_SOL} SOL)`,
    });
  }

  if (vaults.svm.usdc < THRESHOLDS.SVM_VAULT_USDC) {
    warnings.push({
      vault: "svm",
      type: "usdc",
      current: vaults.svm.usdc,
      threshold: THRESHOLDS.SVM_VAULT_USDC,
      message: `SVM vault USDC is low: $${vaults.svm.usdc.toFixed(
        2
      )} (threshold: $${THRESHOLDS.SVM_VAULT_USDC})`,
    });
  }

  // Check EVM vault
  if (vaults.evm.pol < THRESHOLDS.EVM_VAULT_POL) {
    warnings.push({
      vault: "evm",
      type: "pol",
      current: vaults.evm.pol,
      threshold: THRESHOLDS.EVM_VAULT_POL,
      message: `EVM vault POL is low: ${vaults.evm.pol.toFixed(
        4
      )} POL (threshold: ${THRESHOLDS.EVM_VAULT_POL} POL)`,
    });
  }

  if (vaults.evm.usdc < THRESHOLDS.EVM_VAULT_USDC) {
    warnings.push({
      vault: "evm",
      type: "usdc",
      current: vaults.evm.usdc,
      threshold: THRESHOLDS.EVM_VAULT_USDC,
      message: `EVM vault USDC is low: $${vaults.evm.usdc.toFixed(
        2
      )} (threshold: $${THRESHOLDS.EVM_VAULT_USDC})`,
    });
  }

  return { vaults, warnings };
}

/**
 * Check agent EVM balances and return warnings for low POL
 */
function checkAgentEvmBalances(balances: AgentEvmBalance[]): AgentWarning[] {
  const warnings: AgentWarning[] = [];

  for (const balance of balances) {
    if (balance.pol < THRESHOLDS.AGENT_POL) {
      warnings.push({
        modelId: balance.modelId,
        series: balance.series,
        type: "pol",
        current: balance.pol,
        threshold: THRESHOLDS.AGENT_POL,
        message: `Agent ${balance.series} POL is low: ${balance.pol.toFixed(
          4
        )} POL (threshold: ${THRESHOLDS.AGENT_POL} POL)`,
      });
    }
  }

  return warnings;
}

/**
 * GET /api/agents/balances
 *
 * Cron job endpoint - updates all agent balances periodically.
 * Fetches SVM USDC balances and updates the database.
 * Also checks EVM wallet balances and vault liquidity.
 */
export async function GET(req: NextRequest) {
  const logPrefix = "[agents/balances]";

  // Verify cron secret (Vercel sends this for cron jobs)
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    console.log(`${logPrefix} Unauthorized request`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`${logPrefix} Cron job triggered, updating all balances`);

  try {
    // Get the global trading session
    const session = await getGlobalSession();

    // Get models with wallet addresses from env vars
    const models = getModelsWithWallets()
      .filter((m) => m.walletAddress)
      .map((m) => ({
        modelId: m.id,
        walletAddress: m.walletAddress!,
      }));

    // Fetch all balances in parallel
    const [svmUpdated, agentEvmBalances, vaultCheck] = await Promise.all([
      // Update SVM (Solana) USDC balances in database
      updateAllAgentBalances(session.id, models, fetchSvmBalance),
      // Fetch EVM (Polygon) balances for all agents
      fetchAgentEvmBalances(),
      // Check vault balances
      checkVaultBalances(),
    ]);

    // Check agent EVM balances for low POL
    const agentWarnings = checkAgentEvmBalances(agentEvmBalances);

    // Log all warnings
    const allWarnings = [...vaultCheck.warnings, ...agentWarnings];
    for (const warning of allWarnings) {
      console.warn(`${logPrefix} ⚠️ ${warning.message}`);
    }

    console.log(`${logPrefix} Updated ${svmUpdated.length} agent SVM balances`);
    console.log(
      `${logPrefix} Checked ${agentEvmBalances.length} agent EVM wallets`
    );
    if (allWarnings.length > 0) {
      console.warn(`${logPrefix} Found ${allWarnings.length} balance warnings`);
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${svmUpdated.length} agent balances`,
      updated: svmUpdated.length,
      svmBalances: svmUpdated,
      evmBalances: agentEvmBalances.map((b) => ({
        modelId: b.modelId,
        series: b.series,
        evmAddress: b.evmAddress.slice(0, 10) + "...",
        usdc: b.usdc,
        pol: b.pol,
      })),
      vaults: vaultCheck.vaults
        ? {
            svm: {
              address: vaultCheck.vaults.svm.address.slice(0, 8) + "...",
              usdc: vaultCheck.vaults.svm.usdc,
              sol: vaultCheck.vaults.svm.sol,
            },
            evm: {
              address: vaultCheck.vaults.evm.address.slice(0, 10) + "...",
              usdc: vaultCheck.vaults.evm.usdc,
              pol: vaultCheck.vaults.evm.pol,
            },
          }
        : null,
      warnings: allWarnings.map((w) => w.message),
    });
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
