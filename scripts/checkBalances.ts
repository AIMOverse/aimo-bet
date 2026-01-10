// ============================================================================
// Balance Checker Script
// Fetches SOL and USDC balances for all agent wallets defined in .env
// Usage: npx tsx scripts/checkBalances.ts
// ============================================================================

import { config } from "dotenv";
import {
  getSolBalance,
  getTokenAccountsByOwner,
  TOKEN_MINTS,
} from "../lib/crypto/solana/client";

// Load environment variables
config();

// ============================================================================
// Wallet Configuration
// ============================================================================

interface WalletConfig {
  name: string;
  publicKey: string;
}

/**
 * Get all wallet public keys from environment variables
 * Looks for pattern: WALLET_<NAME>_PUBLIC
 */
function getWalletsFromEnv(): WalletConfig[] {
  const wallets: WalletConfig[] = [];

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("WALLET_") && key.endsWith("_PUBLIC") && value) {
      // Extract name: WALLET_GPT_PUBLIC -> GPT
      const name = key.replace("WALLET_", "").replace("_PUBLIC", "");
      wallets.push({
        name,
        publicKey: value,
      });
    }
  }

  return wallets.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// Balance Fetching
// ============================================================================

interface WalletBalances {
  name: string;
  publicKey: string;
  sol: string;
  usdc: string;
  solLamports: bigint;
  usdcRaw: string;
}

async function fetchWalletBalances(
  wallet: WalletConfig
): Promise<WalletBalances> {
  // Fetch SOL balance
  const solBalance = await getSolBalance(wallet.publicKey);

  // Fetch USDC balance
  const usdcAccounts = await getTokenAccountsByOwner(
    wallet.publicKey,
    TOKEN_MINTS.USDC
  );

  // Sum USDC from all token accounts (usually just one ATA)
  let usdcTotal = 0;
  let usdcRaw = "0";
  if (usdcAccounts && usdcAccounts.length > 0) {
    usdcTotal = usdcAccounts.reduce((sum, acc) => sum + (acc.uiAmount ?? 0), 0);
    usdcRaw = usdcAccounts
      .reduce((sum, acc) => BigInt(sum) + BigInt(acc.amount), BigInt(0))
      .toString();
  }

  return {
    name: wallet.name,
    publicKey: wallet.publicKey,
    sol: solBalance?.sol ?? "0",
    usdc: usdcTotal.toFixed(2),
    solLamports: solBalance?.lamports ?? BigInt(0),
    usdcRaw,
  };
}

// ============================================================================
// Display Formatting
// ============================================================================

function formatTable(balances: WalletBalances[]): void {
  // Calculate column widths
  const nameWidth = Math.max(6, ...balances.map((b) => b.name.length));
  const addressWidth = 44; // Solana addresses are 44 chars
  const lamportsWidth = Math.max(
    15,
    ...balances.map((b) => b.solLamports.toString().length)
  );
  const usdcWidth = Math.max(12, ...balances.map((b) => b.usdcRaw.length));

  // Header
  const separator = "─".repeat(
    nameWidth + addressWidth + lamportsWidth + usdcWidth + 13
  );

  console.log("\n" + separator);
  console.log(
    `│ ${"Agent".padEnd(nameWidth)} │ ${"Public Key".padEnd(
      addressWidth
    )} │ ${"Lamports".padStart(lamportsWidth)} │ ${"USDC (raw)".padStart(
      usdcWidth
    )} │`
  );
  console.log(separator);

  // Totals
  let totalSol = BigInt(0);
  let totalUsdc = BigInt(0);

  // Rows
  for (const balance of balances) {
    totalSol += balance.solLamports;
    totalUsdc += BigInt(balance.usdcRaw);

    console.log(
      `│ ${balance.name.padEnd(nameWidth)} │ ${balance.publicKey.padEnd(
        addressWidth
      )} │ ${balance.solLamports
        .toString()
        .padStart(lamportsWidth)} │ ${balance.usdcRaw.padStart(usdcWidth)} │`
    );
  }

  console.log(separator);

  // Totals row
  console.log(
    `│ ${"TOTAL".padEnd(nameWidth)} │ ${" ".padEnd(addressWidth)} │ ${totalSol
      .toString()
      .padStart(lamportsWidth)} │ ${totalUsdc.toString().padStart(usdcWidth)} │`
  );
  console.log(separator + "\n");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("🔍 Fetching wallet balances...\n");

  // Get wallets from env
  const wallets = getWalletsFromEnv();

  if (wallets.length === 0) {
    console.error("❌ No wallets found in .env");
    console.error("   Expected format: WALLET_<NAME>_PUBLIC=<address>");
    process.exit(1);
  }

  console.log(`📋 Found ${wallets.length} wallet(s) in .env\n`);

  // Fetch balances in parallel
  const balances = await Promise.all(wallets.map(fetchWalletBalances));

  // Display results
  formatTable(balances);

  // Summary
  const totalSol = balances.reduce((sum, b) => sum + b.solLamports, BigInt(0));
  const totalUsdc = balances.reduce(
    (sum, b) => sum + BigInt(b.usdcRaw),
    BigInt(0)
  );

  console.log("📊 Summary:");
  console.log(`   Total Lamports:  ${totalSol.toString()}`);
  console.log(`   Total USDC (raw): ${totalUsdc.toString()}`);
  console.log(`   Wallets:          ${balances.length}`);
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
