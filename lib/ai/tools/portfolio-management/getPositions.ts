import { tool } from "ai";
import { z } from "zod";

// ============================================================================
// getPositions Tool - Get current positions using the new 3-step flow
// Flow: RPC query → filter-outcome-mints → markets/batch
// Docs: https://pond.dflow.net/quickstart/user-prediction-positions
// ============================================================================

// Solana RPC endpoint
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Token-2022 Program ID
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

interface TokenAccount {
  mint: string;
  amount: number;
  decimals: number;
}

interface OutcomeMint {
  mint: string;
  marketTicker: string;
  outcome: "yes" | "no";
}

interface MarketInfo {
  ticker: string;
  title: string;
  status: string;
  accounts?: {
    yesMint?: string;
    noMint?: string;
  };
}

interface Position {
  marketTicker: string;
  marketTitle: string;
  outcome: "yes" | "no";
  mint: string;
  quantity: number;
  marketStatus: string;
}

/**
 * Step 1: Get all token accounts for a wallet using Solana RPC
 */
async function getWalletTokenAccounts(wallet: string): Promise<TokenAccount[]> {
  const response = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        wallet,
        { programId: TOKEN_2022_PROGRAM_ID },
        { encoding: "jsonParsed" },
      ],
    }),
  });

  const result = await response.json();

  if (result.error) {
    console.error("[getPositions] RPC error:", result.error);
    return [];
  }

  const accounts = result.result?.value || [];
  const tokenAccounts: TokenAccount[] = [];

  for (const account of accounts) {
    const parsed = account.account?.data?.parsed?.info;
    if (parsed) {
      const amount = parseInt(parsed.tokenAmount?.amount || "0", 10);
      const decimals = parsed.tokenAmount?.decimals || 0;
      const quantity = amount / Math.pow(10, decimals);

      // Only include non-zero balances
      if (quantity > 0) {
        tokenAccounts.push({
          mint: parsed.mint,
          amount: quantity,
          decimals,
        });
      }
    }
  }

  return tokenAccounts;
}

/**
 * Step 2: Filter token accounts to only prediction market outcome mints
 */
async function filterOutcomeMints(
  addresses: string[],
  baseUrl: string,
): Promise<OutcomeMint[]> {
  if (addresses.length === 0) return [];

  // API allows max 200 addresses per request
  const batchSize = 200;
  const allOutcomeMints: OutcomeMint[] = [];

  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);

    const response = await fetch(
      `${baseUrl}/api/dflow/markets/filter-outcome-mints`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: batch }),
      },
    );

    if (!response.ok) {
      console.error(
        "[getPositions] filter-outcome-mints error:",
        response.status,
      );
      continue;
    }

    const data = await response.json();
    if (data.outcomeMints) {
      allOutcomeMints.push(...data.outcomeMints);
    }
  }

  return allOutcomeMints;
}

/**
 * Step 3: Get market details for outcome mints
 */
async function getMarketDetails(
  mints: string[],
  baseUrl: string,
): Promise<Map<string, MarketInfo>> {
  if (mints.length === 0) return new Map();

  const response = await fetch(`${baseUrl}/api/dflow/markets/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mints }),
  });

  if (!response.ok) {
    console.error("[getPositions] markets/batch error:", response.status);
    return new Map();
  }

  const data = await response.json();
  const marketMap = new Map<string, MarketInfo>();

  if (data.markets) {
    for (const market of data.markets) {
      // Map by both yesMint and noMint for lookup
      if (market.accounts?.yesMint) {
        marketMap.set(market.accounts.yesMint, market);
      }
      if (market.accounts?.noMint) {
        marketMap.set(market.accounts.noMint, market);
      }
    }
  }

  return marketMap;
}

export const getPositionsTool = tool({
  description:
    "Get current positions (outcome token holdings) across all prediction markets for a wallet.",
  inputSchema: z.object({
    wallet: z.string().describe("Wallet address to get positions for"),
  }),
  execute: async ({ wallet }) => {
    console.log("[getPositions] execute() called for wallet:", wallet);

    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      // Step 1: Get all token accounts from wallet
      console.log("[getPositions] Step 1: Fetching token accounts...");
      const tokenAccounts = await getWalletTokenAccounts(wallet);
      console.log(
        "[getPositions] Found",
        tokenAccounts.length,
        "token accounts with balance",
      );

      if (tokenAccounts.length === 0) {
        return {
          success: true,
          wallet,
          positions: [],
          count: 0,
        };
      }

      // Step 2: Filter to prediction market outcome mints
      console.log("[getPositions] Step 2: Filtering outcome mints...");
      const mintAddresses = tokenAccounts.map((t) => t.mint);
      const outcomeMints = await filterOutcomeMints(mintAddresses, baseUrl);
      console.log("[getPositions] Found", outcomeMints.length, "outcome mints");

      if (outcomeMints.length === 0) {
        return {
          success: true,
          wallet,
          positions: [],
          count: 0,
        };
      }

      // Step 3: Get market details
      console.log("[getPositions] Step 3: Fetching market details...");
      const outcomeMintAddresses = outcomeMints.map((m) => m.mint);
      const marketDetails = await getMarketDetails(
        outcomeMintAddresses,
        baseUrl,
      );

      // Build positions with full market info
      const positions: Position[] = [];
      const tokenBalanceMap = new Map(
        tokenAccounts.map((t) => [t.mint, t.amount]),
      );

      for (const outcomeMint of outcomeMints) {
        const market = marketDetails.get(outcomeMint.mint);
        const quantity = tokenBalanceMap.get(outcomeMint.mint) || 0;

        // Determine if this is YES or NO based on mint address
        let outcome: "yes" | "no" = "yes";
        if (market?.accounts?.noMint === outcomeMint.mint) {
          outcome = "no";
        }

        positions.push({
          marketTicker: market?.ticker || outcomeMint.marketTicker,
          marketTitle: market?.title || outcomeMint.marketTicker,
          outcome,
          mint: outcomeMint.mint,
          quantity,
          marketStatus: market?.status || "unknown",
        });
      }

      console.log("[getPositions] Returning", positions.length, "positions");

      return {
        success: true,
        wallet,
        positions,
        count: positions.length,
      };
    } catch (error) {
      console.error("[getPositions] Error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        wallet,
      };
    }
  },
});
