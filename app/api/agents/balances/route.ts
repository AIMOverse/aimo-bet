import { NextRequest, NextResponse } from "next/server";
import { getGlobalSession } from "@/lib/supabase/db";
import { updateAllAgentBalances } from "@/lib/supabase/agents";
import { getCurrencyBalance } from "@/lib/crypto/solana/client";

// ============================================================================
// Agent Balances Cron Endpoint
// ============================================================================
// GET /api/agents/balances - Update all agent balances from on-chain data
//
// Authentication: Requires CRON_SECRET in Authorization header.
//
// This endpoint fetches USDC balances from Solana for all agents and updates
// the database. It ensures the leaderboard reflects current on-chain state.
//
// Configure cron in vercel.json:
// {
//   "crons": [
//     { "path": "/api/agents/balances", "schedule": "*/5 * * * *" }
//   ]
// }
// ============================================================================

/**
 * Fetch USDC balance from Solana for a wallet address
 */
async function fetchBalance(walletAddress: string): Promise<number | null> {
  const result = await getCurrencyBalance(walletAddress, "USDC");
  if (result === null) return null;
  return Number(result.formatted);
}

/**
 * GET /api/agents/balances
 *
 * Cron job endpoint - updates all agent balances periodically.
 * Fetches USDC balances from Solana and updates the database.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this for cron jobs)
  const authHeader = req.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    console.log("[agents/balances] Unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[agents/balances] Cron job triggered, updating all balances");

  try {
    // Get the global trading session
    const session = await getGlobalSession();

    // Update all agent balances
    const updated = await updateAllAgentBalances(session.id, fetchBalance);

    console.log(`[agents/balances] Updated ${updated.length} agent balances`);

    return NextResponse.json({
      success: true,
      message: `Updated ${updated.length} agent balances`,
      updated: updated.length,
      balances: updated,
    });
  } catch (error) {
    console.error("[agents/balances] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
