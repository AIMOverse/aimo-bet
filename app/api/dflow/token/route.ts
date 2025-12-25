import { NextResponse } from "next/server";
import { dflowQuoteFetch } from "@/lib/dflow/client";

// ============================================================================
// dflow Token API
// Docs: https://pond.dflow.net/swap-api-reference/token/tokens
// Docs: https://pond.dflow.net/swap-api-reference/token/tokens-with-decimals
// ============================================================================

// ============================================================================
// GET /api/dflow/token - Get list of supported token mints
// Query params:
//   - withDecimals: boolean (optional) - Include decimals info for each token
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const withDecimals = searchParams.get("withDecimals") === "true";

    const endpoint = withDecimals ? "/tokens-with-decimals" : "/tokens";

    console.log("[dflow/token] Fetching tokens:", { withDecimals, endpoint });

    const response = await dflowQuoteFetch(endpoint);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[dflow/token] API error:", response.status, errorText);
      return NextResponse.json(
        { error: `dflow API error: ${response.status}`, details: errorText },
        { status: response.status },
      );
    }

    const data = await response.json();

    // Response formats:
    // /tokens: string[] - array of mint addresses
    // /tokens-with-decimals: [string, number][] - array of [mint, decimals] tuples

    if (withDecimals) {
      // Transform tuple array to more usable object format
      const tokens = (data as [string, number][]).map(([mint, decimals]) => ({
        mint,
        decimals,
      }));
      console.log("[dflow/token] Fetched", tokens.length, "tokens with decimals");
      return NextResponse.json(tokens);
    }

    console.log("[dflow/token] Fetched", data?.length || 0, "token mints");
    return NextResponse.json(data);
  } catch (error) {
    console.error("[dflow/token] Failed to fetch tokens:", error);
    return NextResponse.json(
      { error: "Failed to fetch tokens" },
      { status: 500 },
    );
  }
}
