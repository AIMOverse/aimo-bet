import { NextResponse } from "next/server";
import {
  getSessionPortfolios,
  getPortfolioPositions,
  updatePortfolioCash,
} from "@/lib/supabase/arena";

// ============================================================================
// GET /api/arena/portfolios - Get portfolios for a session
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const portfolioId = searchParams.get("portfolioId");
    const includePositions = searchParams.get("includePositions") === "true";

    if (!sessionId && !portfolioId) {
      return NextResponse.json(
        { error: "sessionId or portfolioId is required" },
        { status: 400 }
      );
    }

    // Get specific portfolio with positions
    if (portfolioId && includePositions) {
      const positions = await getPortfolioPositions(portfolioId, true);
      return NextResponse.json({ positions });
    }

    // Get all portfolios for session
    if (sessionId) {
      const portfolios = await getSessionPortfolios(sessionId);

      // Optionally include positions for each portfolio
      if (includePositions) {
        const portfoliosWithPositions = await Promise.all(
          portfolios.map(async (portfolio) => {
            const positions = await getPortfolioPositions(portfolio.id, true);
            const positionsValue = positions.reduce(
              (sum, p) => sum + (p.currentValue || p.quantity * p.avgEntryPrice),
              0
            );
            return {
              ...portfolio,
              positions,
              totalValue: portfolio.cashBalance + positionsValue,
            };
          })
        );
        return NextResponse.json(portfoliosWithPositions);
      }

      return NextResponse.json(portfolios);
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error("Failed to get portfolios:", error);
    return NextResponse.json(
      { error: "Failed to get portfolios" },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH /api/arena/portfolios - Update portfolio cash balance
// ============================================================================

export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const portfolioId = searchParams.get("id");

    if (!portfolioId) {
      return NextResponse.json(
        { error: "Portfolio ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { cashBalance } = body;

    if (typeof cashBalance !== "number") {
      return NextResponse.json(
        { error: "cashBalance must be a number" },
        { status: 400 }
      );
    }

    await updatePortfolioCash(portfolioId, cashBalance);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update portfolio:", error);
    return NextResponse.json(
      { error: "Failed to update portfolio" },
      { status: 500 }
    );
  }
}
