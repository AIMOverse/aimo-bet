// ============================================================================
// Bridge Tool Checker Script
// Tests manual vault-based USDC bridging between Solana and Polygon
// Usage: bun scripts/checkBridge.ts [--to-solana|--to-polygon|--balances] [amount]
//
// WARNING: This script moves REAL MONEY! Default amount is $1.
// ============================================================================

// Load environment variables FIRST
import "dotenv/config";

import { getCurrencyBalance, getSolBalance } from "@/lib/crypto/solana/client";
import {
  getUsdcBalance,
  getPolBalance,
  createPolygonWallet,
} from "@/lib/crypto/polygon/client";
import { createSignerFromBase58SecretKey } from "@/lib/crypto/solana/wallets";
import {
  bridgePolygonToSolana,
  bridgeSolanaToPolygon,
  getVaultBalances,
} from "@/lib/prediction-market/rebalancing/manualBridge";

// ============================================================================
// Types
// ============================================================================

interface StepResult {
  step: string;
  success: boolean;
  duration: number;
  data?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Color Helpers
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ============================================================================
// Balance Display Functions
// ============================================================================

async function displayVaultBalances(): Promise<void> {
  console.log("═".repeat(60));
  console.log("  🏦 Bridge Vault Balances");
  console.log("═".repeat(60));

  const vaults = await getVaultBalances();

  if (!vaults) {
    console.log(`  ${colors.red}✗ Vaults not configured${colors.reset}`);
    console.log(
      `  Set BRIDGE_VAULT_SVM_PRIVATE_KEY and BRIDGE_VAULT_EVM_PRIVATE_KEY`
    );
    return;
  }

  console.log(`  ${colors.cyan}SVM Vault (Solana):${colors.reset}`);
  console.log(`    Address: ${vaults.svm.address}`);
  console.log(`    USDC:    $${vaults.svm.usdc.toFixed(2)}`);
  console.log(`    SOL:     ${vaults.svm.sol.toFixed(4)} SOL`);

  console.log();

  console.log(`  ${colors.cyan}EVM Vault (Polygon):${colors.reset}`);
  console.log(`    Address: ${vaults.evm.address}`);
  console.log(`    USDC.e:  $${vaults.evm.usdc.toFixed(2)}`);
  console.log(`    POL:     ${vaults.evm.pol.toFixed(4)} POL`);

  console.log();
}

async function displayAgentBalances(
  svmAddress: string,
  evmAddress: string
): Promise<void> {
  console.log("═".repeat(60));
  console.log("  👛 Agent Wallet Balances");
  console.log("═".repeat(60));

  // Fetch all balances in parallel
  const [svmUsdc, svmSol, evmUsdc, evmPol] = await Promise.all([
    getCurrencyBalance(svmAddress, "USDC"),
    getSolBalance(svmAddress),
    getUsdcBalance(evmAddress),
    getPolBalance(evmAddress),
  ]);

  console.log(`  ${colors.cyan}Solana Wallet:${colors.reset}`);
  console.log(`    Address: ${svmAddress}`);
  console.log(
    `    USDC:    $${svmUsdc ? Number(svmUsdc.formatted).toFixed(2) : "0.00"}`
  );
  console.log(
    `    SOL:     ${svmSol ? Number(svmSol.sol).toFixed(4) : "0.0000"} SOL`
  );

  console.log();

  console.log(`  ${colors.cyan}Polygon Wallet:${colors.reset}`);
  console.log(`    Address: ${evmAddress}`);
  console.log(`    USDC.e:  $${evmUsdc?.balance.toFixed(2) ?? "0.00"}`);
  console.log(`    POL:     ${evmPol?.balance.toFixed(4) ?? "0.0000"} POL`);

  console.log();
}

// ============================================================================
// Bridge Functions
// ============================================================================

async function runBridgeToSolana(
  amount: number,
  evmPrivateKey: string,
  svmAddress: string
): Promise<StepResult> {
  console.log("═".repeat(60));
  console.log("  🌉 Bridge: Polygon → Solana");
  console.log("═".repeat(60));
  console.log(`  Amount: $${amount}`);
  console.log();

  const startTime = Date.now();

  try {
    const evmWallet = createPolygonWallet(evmPrivateKey);

    const result = await bridgePolygonToSolana(amount, evmWallet, svmAddress);

    if (!result.success) {
      console.log(
        `  ${colors.red}✗ Bridge failed: ${result.error}${colors.reset}`
      );
      return {
        step: "Bridge Polygon → Solana",
        success: false,
        duration: Date.now() - startTime,
        error: result.error,
      };
    }

    console.log(`  ${colors.green}✓${colors.reset} Bridge successful!`);
    console.log(`  Source TX (Polygon): ${result.sourceTxHash}`);
    console.log(`  Dest TX (Solana):    ${result.destinationTxHash}`);
    console.log(`  Amount bridged:      $${result.amountBridged}`);
    console.log(
      `  Duration:            ${formatDuration(Date.now() - startTime)}`
    );
    console.log();

    return {
      step: "Bridge Polygon → Solana",
      success: true,
      duration: Date.now() - startTime,
      data: {
        source_tx: result.sourceTxHash,
        destination_tx: result.destinationTxHash,
        amount_bridged: result.amountBridged,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(`  ${colors.red}✗ Error: ${message}${colors.reset}`);
    return {
      step: "Bridge Polygon → Solana",
      success: false,
      duration: Date.now() - startTime,
      error: message,
    };
  }
}

async function runBridgeToPolygon(
  amount: number,
  svmPrivateKey: string,
  evmAddress: string
): Promise<StepResult> {
  console.log("═".repeat(60));
  console.log("  🌉 Bridge: Solana → Polygon");
  console.log("═".repeat(60));
  console.log(`  Amount: $${amount}`);
  console.log();

  const startTime = Date.now();

  try {
    const svmSigner = await createSignerFromBase58SecretKey(svmPrivateKey);

    const result = await bridgeSolanaToPolygon(amount, svmSigner, evmAddress);

    if (!result.success) {
      console.log(
        `  ${colors.red}✗ Bridge failed: ${result.error}${colors.reset}`
      );
      return {
        step: "Bridge Solana → Polygon",
        success: false,
        duration: Date.now() - startTime,
        error: result.error,
      };
    }

    console.log(`  ${colors.green}✓${colors.reset} Bridge successful!`);
    console.log(`  Source TX (Solana):  ${result.sourceTxHash}`);
    console.log(`  Dest TX (Polygon):   ${result.destinationTxHash}`);
    console.log(`  Amount bridged:      $${result.amountBridged}`);
    console.log(
      `  Duration:            ${formatDuration(Date.now() - startTime)}`
    );
    console.log();

    return {
      step: "Bridge Solana → Polygon",
      success: true,
      duration: Date.now() - startTime,
      data: {
        source_tx: result.sourceTxHash,
        destination_tx: result.destinationTxHash,
        amount_bridged: result.amountBridged,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(`  ${colors.red}✗ Error: ${message}${colors.reset}`);
    return {
      step: "Bridge Solana → Polygon",
      success: false,
      duration: Date.now() - startTime,
      error: message,
    };
  }
}

// ============================================================================
// Summary
// ============================================================================

function printSummary(results: StepResult[]): void {
  console.log("═".repeat(60));
  console.log("  📊 Summary");
  console.log("═".repeat(60));

  for (const result of results) {
    const status = result.success
      ? `${colors.green}✓${colors.reset}`
      : `${colors.red}✗${colors.reset}`;
    const duration = formatDuration(result.duration);

    console.log(`  ${status} ${result.step} (${duration})`);
    if (result.error) {
      console.log(`    ${colors.red}Error: ${result.error}${colors.reset}`);
    }
  }

  console.log();
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log();
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         🌉 Manual Bridge Checker                           ║");
  console.log("║         Vault-based USDC Cross-chain Transfer              ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();

  // Parse CLI arguments
  const args = process.argv.slice(2);
  const toSolana = args.includes("--to-solana");
  const toPolygon = args.includes("--to-polygon");
  const showBalances = args.includes("--balances") || (!toSolana && !toPolygon);

  // Get amount from args (default $1)
  const amountArg = args.find((arg) => !arg.startsWith("--"));
  const amount = amountArg ? parseFloat(amountArg) : 1;

  // Load keys from environment (use WALLET_GPT_* keys for testing)
  const svmPrivateKey =
    process.env.WALLET_GPT_SVM_PRIVATE ||
    process.env.SVM_PRIVATE_KEY ||
    process.env.PRIVATE_KEY;
  const evmPrivateKey =
    process.env.WALLET_GPT_EVM_PRIVATE ||
    process.env.EVM_PRIVATE_KEY ||
    process.env.POLYGON_PRIVATE_KEY;

  if (!svmPrivateKey || !evmPrivateKey) {
    console.log(
      `  ${colors.red}✗ Missing required environment variables:${colors.reset}`
    );
    if (!svmPrivateKey)
      console.log("    - WALLET_GPT_SVM_PRIVATE (or SVM_PRIVATE_KEY)");
    if (!evmPrivateKey)
      console.log("    - WALLET_GPT_EVM_PRIVATE (or EVM_PRIVATE_KEY)");
    console.log();
    process.exit(1);
  }

  // Create signers to get addresses
  const svmSigner = await createSignerFromBase58SecretKey(svmPrivateKey);
  const evmWallet = createPolygonWallet(evmPrivateKey);

  const results: StepResult[] = [];

  // Always show vault balances first
  await displayVaultBalances();

  // Show agent balances
  await displayAgentBalances(svmSigner.address, evmWallet.address);

  if (showBalances && !toSolana && !toPolygon) {
    console.log("  Usage:");
    console.log(
      "    bun scripts/checkBridge.ts --balances        # Show balances only"
    );
    console.log(
      "    bun scripts/checkBridge.ts --to-solana [amt] # Bridge Polygon → Solana"
    );
    console.log(
      "    bun scripts/checkBridge.ts --to-polygon [amt] # Bridge Solana → Polygon"
    );
    console.log();
    return;
  }

  // Run bridge operations
  if (toSolana) {
    const result = await runBridgeToSolana(
      amount,
      evmPrivateKey,
      svmSigner.address
    );
    results.push(result);

    // Show updated balances
    console.log(`  ${colors.cyan}Updated balances:${colors.reset}`);
    await displayAgentBalances(svmSigner.address, evmWallet.address);
  }

  if (toPolygon) {
    const result = await runBridgeToPolygon(
      amount,
      svmPrivateKey,
      evmWallet.address
    );
    results.push(result);

    // Show updated balances
    console.log(`  ${colors.cyan}Updated balances:${colors.reset}`);
    await displayAgentBalances(svmSigner.address, evmWallet.address);
  }

  if (results.length > 0) {
    printSummary(results);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
