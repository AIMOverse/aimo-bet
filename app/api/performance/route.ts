import { NextResponse } from "next/server";
import {
  getPerformanceSnapshots,
  createPerformanceSnapshot,
  createBulkSnapshots,
} from "@/lib/supabase/arena";

// ============================================================================
// GET /api/performance - Get performance snapshots for a session
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const hoursBack = parseInt(searchParams.get("hoursBack") || "24", 10);

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const snapshots = await getPerformanceSnapshots(sessionId, hoursBack);
    return NextResponse.json(snapshots);
  } catch (error) {
    console.error("Failed to get snapshots:", error);
    return NextResponse.json(
      { error: "Failed to get snapshots" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/performance - Create performance snapshot(s)
// ============================================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Support both single and bulk creation
    if (Array.isArray(body)) {
      // Bulk creation
      const snapshots = body as Array<{
        sessionId: string;
        modelId: string;
        accountValue: number;
      }>;

      if (snapshots.length === 0) {
        return NextResponse.json(
          { error: "At least one snapshot is required" },
          { status: 400 }
        );
      }

      // Validate all entries
      for (const snapshot of snapshots) {
        if (!snapshot.sessionId || !snapshot.modelId || typeof snapshot.accountValue !== "number") {
          return NextResponse.json(
            { error: "Each snapshot requires sessionId, modelId, and accountValue" },
            { status: 400 }
          );
        }
      }

      await createBulkSnapshots(snapshots);
      return NextResponse.json({ success: true, count: snapshots.length }, { status: 201 });
    } else {
      // Single creation
      const { sessionId, modelId, accountValue } = body as {
        sessionId: string;
        modelId: string;
        accountValue: number;
      };

      if (!sessionId || !modelId || typeof accountValue !== "number") {
        return NextResponse.json(
          { error: "sessionId, modelId, and accountValue are required" },
          { status: 400 }
        );
      }

      const snapshot = await createPerformanceSnapshot(sessionId, modelId, accountValue);
      return NextResponse.json(snapshot, { status: 201 });
    }
  } catch (error) {
    console.error("Failed to create snapshot:", error);
    return NextResponse.json(
      { error: "Failed to create snapshot" },
      { status: 500 }
    );
  }
}
