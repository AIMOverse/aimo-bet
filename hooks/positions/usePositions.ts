"use client";

import useSWR from "swr";
import { POLLING_INTERVALS } from "@/lib/config";
import { MODELS } from "@/lib/ai/models/models";

// ============================================================================
// Types for dflow positions
// ============================================================================

export interface DflowPosition {
  marketTicker: string;
  marketTitle: string;
  outcome: "yes" | "no";
  mint: string;
  quantity: number;
  marketStatus: string;
  modelId?: string;
  modelName?: string;
}

// ============================================================================
// Fetch positions using the new 3-step flow
// 1. RPC query for token accounts
// 2. Filter to outcome mints via /api/dflow/markets/filter-outcome-mints
// 3. Get market details via /api/dflow/markets/batch
// ============================================================================

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

interface TokenAccount {
  mint: string;
  amount: number;
}

interface MarketData {
  ticker: string;
  title: string;
  status: string;
  accounts?: {
    yesMint?: string;
    noMint?: string;
  };
}

async function fetchDflowPositions(wallet: string): Promise<DflowPosition[]> {
  // Step 1: Get all token accounts from wallet
  const rpcResponse = await fetch(SOLANA_RPC_URL, {
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

  const rpcResult = await rpcResponse.json();
  if (rpcResult.error) {
    console.error("[usePositions] RPC error:", rpcResult.error);
    return [];
  }

  const accounts = rpcResult.result?.value || [];
  const tokenAccounts: TokenAccount[] = [];

  for (const account of accounts) {
    const parsed = account.account?.data?.parsed?.info;
    if (parsed) {
      const amount = parseInt(parsed.tokenAmount?.amount || "0", 10);
      const decimals = parsed.tokenAmount?.decimals || 0;
      const quantity = amount / Math.pow(10, decimals);
      if (quantity > 0) {
        tokenAccounts.push({ mint: parsed.mint, amount: quantity });
      }
    }
  }

  if (tokenAccounts.length === 0) return [];

  // Step 2: Filter to prediction market outcome mints
  const filterRes = await fetch("/api/dflow/markets/filter-outcome-mints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses: tokenAccounts.map((t) => t.mint) }),
  });

  if (!filterRes.ok) {
    console.error(
      "[usePositions] filter-outcome-mints error:",
      filterRes.status,
    );
    return [];
  }

  const filterData = await filterRes.json();
  const outcomeMints = filterData.outcomeMints || [];

  if (outcomeMints.length === 0) return [];

  // Step 3: Get market details
  const batchRes = await fetch("/api/dflow/markets/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mints: outcomeMints.map((m: { mint: string }) => m.mint),
    }),
  });

  if (!batchRes.ok) {
    console.error("[usePositions] markets/batch error:", batchRes.status);
    return [];
  }

  const batchData = await batchRes.json();
  const markets = batchData.markets || [];

  // Build market lookup by mint
  const marketByMint = new Map<string, MarketData>();
  for (const market of markets as MarketData[]) {
    if (market.accounts?.yesMint)
      marketByMint.set(market.accounts.yesMint, market);
    if (market.accounts?.noMint)
      marketByMint.set(market.accounts.noMint, market);
  }

  // Build positions
  const tokenBalanceMap = new Map(tokenAccounts.map((t) => [t.mint, t.amount]));
  const positions: DflowPosition[] = [];

  for (const outcomeMint of outcomeMints) {
    const market = marketByMint.get(outcomeMint.mint);
    const quantity = tokenBalanceMap.get(outcomeMint.mint) || 0;

    // Determine YES or NO based on mint
    const outcome: "yes" | "no" =
      market?.accounts?.noMint === outcomeMint.mint ? "no" : "yes";

    positions.push({
      marketTicker: market?.ticker || outcomeMint.marketTicker,
      marketTitle: market?.title || outcomeMint.marketTicker,
      outcome,
      mint: outcomeMint.mint,
      quantity,
      marketStatus: market?.status || "unknown",
    });
  }

  return positions;
}

// ============================================================================
// Hook to fetch positions for models
// ============================================================================

interface UsePositionsOptions {
  sessionId: string;
  modelId?: string; // Filter by specific model
}

export function usePositions({ sessionId, modelId }: UsePositionsOptions) {
  // Get wallets for models from models config
  const walletToModel = new Map<string, { id: string; name: string }>();
  if (modelId) {
    const model = MODELS.find((m) => m.id === modelId);
    if (model?.walletAddress) {
      walletToModel.set(model.walletAddress, {
        id: model.id,
        name: model.name,
      });
    }
  } else {
    MODELS.forEach((m) => {
      if (m.walletAddress) {
        walletToModel.set(m.walletAddress, { id: m.id, name: m.name });
      }
    });
  }

  const wallets = Array.from(walletToModel.keys());

  // Fetch positions for each wallet using the new 3-step flow
  const { data, isLoading, error, mutate } = useSWR<DflowPosition[]>(
    wallets.length > 0 ? `dflow/positions/${wallets.join(",")}` : null,
    async () => {
      const results = await Promise.all(
        wallets.map(async (wallet) => {
          const positions = await fetchDflowPositions(wallet);
          const modelInfo = walletToModel.get(wallet);
          return positions.map((p) => ({
            ...p,
            modelId: modelInfo?.id,
            modelName: modelInfo?.name,
          }));
        }),
      );
      return results.flat();
    },
    {
      refreshInterval: POLLING_INTERVALS.positions,
    },
  );

  return {
    positions: data || [],
    isLoading,
    error,
    mutate,
  };
}

// ============================================================================
// Hook to fetch all positions for a session
// ============================================================================

export function useSessionPositions(sessionId: string | null) {
  const result = usePositions({ sessionId: sessionId ?? "" });

  if (!sessionId) {
    return {
      positions: [] as DflowPosition[],
      isLoading: false,
      error: undefined,
      mutate: () => Promise.resolve(undefined),
    };
  }

  return result;
}
