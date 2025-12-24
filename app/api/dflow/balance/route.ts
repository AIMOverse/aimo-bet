import { NextResponse } from "next/server";

// ============================================================================
// Wallet Balance - On-chain query (Solana RPC)
// ============================================================================

// Common SPL token mints for prediction markets
const TOKEN_MINTS = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // Mainnet USDC
  CASH: "CASHVDm2wsJXfhj6VWxb7GiMdoLc17Du7paH4bNr5woT", // Example CASH token
};

// Solana RPC endpoint
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Token program ID
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// ============================================================================
// Helper: Get token accounts by owner and mint
// ============================================================================

async function getTokenAccountsByOwnerAndMint(
  owner: string,
  mint: string
): Promise<{ balance: number; decimals: number } | null> {
  try {
    const response = await fetch(SOLANA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          owner,
          { mint },
          { encoding: "jsonParsed" },
        ],
      }),
    });

    const result = await response.json();

    if (result.error) {
      console.error("[dflow/balance] RPC error:", result.error);
      return null;
    }

    // Sum up balances from all token accounts for this mint
    const accounts = result.result?.value || [];
    if (accounts.length === 0) {
      return { balance: 0, decimals: 6 }; // Default to 6 decimals (USDC)
    }

    let totalBalance = 0;
    let decimals = 6;

    for (const account of accounts) {
      const parsed = account.account?.data?.parsed?.info;
      if (parsed) {
        totalBalance += parseInt(parsed.tokenAmount?.amount || "0", 10);
        decimals = parsed.tokenAmount?.decimals || 6;
      }
    }

    return { balance: totalBalance, decimals };
  } catch (error) {
    console.error("[dflow/balance] Failed to query token accounts:", error);
    return null;
  }
}

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

    // Query on-chain token balance
    const tokenBalance = await getTokenAccountsByOwnerAndMint(
      walletAddress,
      mint
    );

    if (!tokenBalance) {
      // Return zero balance on RPC error (graceful degradation)
      const balance = {
        wallet: walletAddress,
        currency,
        mint,
        balance: 0,
        decimals: 6,
        formatted: "0.00",
      };
      console.log("[dflow/balance] RPC failed, returning zero balance");
      return NextResponse.json(balance);
    }

    // Format the balance
    const formatted = (
      tokenBalance.balance / Math.pow(10, tokenBalance.decimals)
    ).toFixed(2);

    const balance = {
      wallet: walletAddress,
      currency,
      mint,
      balance: tokenBalance.balance,
      decimals: tokenBalance.decimals,
      formatted,
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
