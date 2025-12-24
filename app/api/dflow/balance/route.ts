import { NextResponse } from "next/server";

// ============================================================================
// Wallet Balance - On-chain query (Solana RPC)
// ============================================================================

// Common SPL token mints for prediction markets
const TOKEN_MINTS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Mainnet USDC
  CASH: "CASHVDm2wsJXfhj6VWxb7GiMdoLc17Du7paH4bNr5woT", // Example CASH token
};

// ============================================================================
// GET /api/dflow/balance - Get wallet balance
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const currency = searchParams.get("currency") || "USDC";
    const walletAddress = searchParams.get("wallet");

    console.log("[dflow/balance] Fetching balance:", { currency, walletAddress });

    if (!walletAddress) {
      return NextResponse.json(
        { error: "wallet address is required" },
        { status: 400 }
      );
    }

    const mint = TOKEN_MINTS[currency as keyof typeof TOKEN_MINTS];
    if (!mint) {
      return NextResponse.json(
        { error: `Unsupported currency: ${currency}. Supported: USDC, CASH` },
        { status: 400 }
      );
    }

    // In a full implementation, we would query Solana RPC for token balance
    // Using getTokenAccountsByOwner or similar
    // For now, return a placeholder structure
    const balance = {
      wallet: walletAddress,
      currency,
      mint,
      balance: 0, // Would be fetched from on-chain
      decimals: 6, // USDC has 6 decimals
      formatted: "0.00",
    };

    console.log("[dflow/balance] Returning balance:", balance);

    return NextResponse.json(balance);
  } catch (error) {
    console.error("[dflow/balance] Failed to fetch balance:", error);
    return NextResponse.json(
      { error: "Failed to fetch balance" },
      { status: 500 }
    );
  }
}
