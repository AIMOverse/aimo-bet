import { NextResponse } from "next/server";
import { getSessionTrades, createTrade } from "@/lib/supabase/arena";
import type { PositionSide, TradeAction } from "@/types/arena";

// ============================================================================
// GET /api/arena/trades - Get trades for a session
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const trades = await getSessionTrades(sessionId, limit);
    return NextResponse.json(trades);
  } catch (error) {
    console.error("Failed to get trades:", error);
    return NextResponse.json(
      { error: "Failed to get trades" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/arena/trades - Create new trade
// ============================================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      portfolioId,
      positionId,
      marketTicker,
      marketTitle,
      side,
      action,
      quantity,
      price,
      pnl,
      reasoning,
    } = body as {
      portfolioId: string;
      positionId?: string;
      marketTicker: string;
      marketTitle: string;
      side: PositionSide;
      action: TradeAction;
      quantity: number;
      price: number;
      pnl?: number;
      reasoning?: string;
    };

    if (!portfolioId || !marketTicker || !side || !action || !quantity || !price) {
      return NextResponse.json(
        { error: "portfolioId, marketTicker, side, action, quantity, and price are required" },
        { status: 400 }
      );
    }

    const notional = quantity * price;

    const trade = await createTrade(portfolioId, {
      positionId,
      marketTicker,
      marketTitle: marketTitle || marketTicker,
      side,
      action,
      quantity,
      price,
      notional,
      pnl,
      reasoning,
    });

    return NextResponse.json(trade, { status: 201 });
  } catch (error) {
    console.error("Failed to create trade:", error);
    return NextResponse.json(
      { error: "Failed to create trade" },
      { status: 500 }
    );
  }
}
