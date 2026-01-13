/**
 * Generate EVM Wallets for AI Agent Polymarket Trading
 *
 * Uses viem to generate EVM private keys and addresses for each model series.
 * Outputs environment variable declarations to copy to .env files.
 *
 * Usage:
 *   npx tsx scripts/generateEvmWallets.ts
 *
 * Output:
 *   Prints environment variables to console (copy to .env.local)
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// Model series that need EVM wallets (matches WALLET_REGISTRY in registry.ts)
const MODEL_SERIES = [
  "GPT",
  "CLAUDE",
  "DEEPSEEK",
  "GLM",
  "GROK",
  "QWEN",
  "GEMINI",
  "KIMI",
] as const;

interface WalletInfo {
  series: string;
  address: string;
  privateKey: string;
}

function generateWallet(series: string): WalletInfo {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  return {
    series,
    address: account.address,
    privateKey,
  };
}

function main(): void {
  console.log("# ============================================================");
  console.log("# EVM Wallets for AI Agents (Polymarket/Polygon)");
  console.log("# Generated:", new Date().toISOString());
  console.log("# ============================================================");
  console.log("#");
  console.log("# Add these to your .env.local file");
  console.log(
    "# ============================================================\n"
  );

  const wallets: WalletInfo[] = [];

  for (const series of MODEL_SERIES) {
    const wallet = generateWallet(series);
    wallets.push(wallet);
  }

  // Output private keys (for .env.local - never commit!)
  console.log("# Private Keys (NEVER COMMIT THESE!)");
  console.log("# ----------------------------------");
  for (const wallet of wallets) {
    console.log(`WALLET_${wallet.series}_EVM_PRIVATE=${wallet.privateKey}`);
  }

  console.log("\n# Public Addresses (safe to share)");
  console.log("# ---------------------------------");
  for (const wallet of wallets) {
    console.log(`WALLET_${wallet.series}_EVM_PUBLIC=${wallet.address}`);
  }

  // Summary table
  console.log(
    "\n# ============================================================"
  );
  console.log("# Summary");
  console.log("# ============================================================");
  console.log("#");
  console.log("# Series     | Address");
  console.log("# -----------|--------------------------------------------");
  for (const wallet of wallets) {
    const paddedSeries = wallet.series.padEnd(10);
    console.log(`# ${paddedSeries} | ${wallet.address}`);
  }

  console.log("#");
  console.log("# ============================================================");
  console.log("# IMPORTANT: Fund each address with USDC.e on Polygon");
  console.log("# Or use bridgeUSDCToPolygon() to bridge from Solana");
  console.log("# ============================================================");
}

main();
