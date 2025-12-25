import { NextResponse } from "next/server";
import {
  getCurrencyBalance,
  getSolBalance,
  TOKEN_MINTS,
  type SupportedCurrency,
} from "@/lib/solana/client";

// ============================================================================
// GET /api/solana/balance - Get wallet balance
// Supports both native SOL and SPL tokens (USDC, CASH)
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");
    const currency = (searchParams.get("currency") || "USDC") as
      | SupportedCurrency
      | "SOL";

    console.log("[solana/balance] Fetching balance:", { wallet, currency });

    if (!wallet) {
      return NextResponse.json(
        { error: "wallet parameter is required" },
        { status: 400 },
      );
    }

    // Handle native SOL balance
    if (currency === "SOL") {
      const solBalance = await getSolBalance(wallet);

      if (solBalance === null) {
        return NextResponse.json({
          wallet,
          currency: "SOL",
          amount: "0",
          decimals: 9,
          formatted: "0.000000000",
        });
      }

      console.log("[solana/balance] SOL balance:", solBalance);

      return NextResponse.json({
        wallet,
        currency: "SOL",
        amount: solBalance.lamports.toString(),
        decimals: 9,
        formatted: solBalance.sol,
      });
    }

    // Handle SPL token balance (USDC, CASH)
    if (!(currency in TOKEN_MINTS)) {
      return NextResponse.json(
        {
          error: `Unsupported currency: ${currency}. Supported: SOL, USDC, CASH`,
        },
        { status: 400 },
      );
    }

    const tokenBalance = await getCurrencyBalance(
      wallet,
      currency as SupportedCurrency,
    );

    if (tokenBalance === null) {
      // Graceful degradation on RPC error
      console.log("[solana/balance] RPC failed, returning zero balance");
      return NextResponse.json({
        wallet,
        currency,
        mint: TOKEN_MINTS[currency as SupportedCurrency],
        amount: "0",
        decimals: 6,
        formatted: "0.00",
      });
    }

    console.log("[solana/balance] Token balance:", tokenBalance);

    // Convert bigint to string for JSON serialization
    return NextResponse.json({
      wallet: tokenBalance.wallet,
      currency: tokenBalance.currency,
      mint: tokenBalance.mint,
      amount: tokenBalance.amount.toString(),
      decimals: tokenBalance.decimals,
      formatted: tokenBalance.formatted,
    });
  } catch (error) {
    console.error("[solana/balance] Failed to fetch balance:", error);
    return NextResponse.json(
      { error: "Failed to fetch balance" },
      { status: 500 },
    );
  }
}
