import { NextResponse } from "next/server";
import {
  getPortfolioPositions,
  createPosition,
  closePosition,
} from "@/lib/supabase/arena";
import type { PositionSide } from "@/types/arena";

// ============================================================================
// GET /api/arena/positions - Get positions for a portfolio
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const portfolioId = searchParams.get("portfolioId");
    const openOnly = searchParams.get("openOnly") !== "false";

    if (!portfolioId) {
      return NextResponse.json(
        { error: "portfolioId is required" },
        { status: 400 }
      );
    }

    const positions = await getPortfolioPositions(portfolioId, openOnly);
    return NextResponse.json(positions);
  } catch (error) {
    console.error("Failed to get positions:", error);
    return NextResponse.json(
      { error: "Failed to get positions" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/arena/positions - Create new position
// ============================================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      portfolioId,
      marketTicker,
      marketTitle,
      side,
      quantity,
      avgEntryPrice,
    } = body as {
      portfolioId: string;
      marketTicker: string;
      marketTitle: string;
      side: PositionSide;
      quantity: number;
      avgEntryPrice: number;
    };

    if (!portfolioId || !marketTicker || !side || !quantity || !avgEntryPrice) {
      return NextResponse.json(
        { error: "portfolioId, marketTicker, side, quantity, and avgEntryPrice are required" },
        { status: 400 }
      );
    }

    const position = await createPosition(portfolioId, {
      marketTicker,
      marketTitle: marketTitle || marketTicker,
      side,
      quantity,
      avgEntryPrice,
    });

    return NextResponse.json(position, { status: 201 });
  } catch (error) {
    console.error("Failed to create position:", error);
    return NextResponse.json(
      { error: "Failed to create position" },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH /api/arena/positions - Close position
// ============================================================================

export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const positionId = searchParams.get("id");

    if (!positionId) {
      return NextResponse.json(
        { error: "Position ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { action } = body;

    if (action === "close") {
      await closePosition(positionId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Invalid action. Supported: close" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to update position:", error);
    return NextResponse.json(
      { error: "Failed to update position" },
      { status: 500 }
    );
  }
}
