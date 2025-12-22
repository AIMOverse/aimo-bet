import { NextResponse } from "next/server";

const TOOLS = null;

/**
 * GET /api/models
 *
 * Returns the list of available tools.
 * Currently returns static tools from config,
 * but can be extended to fetch from AiMo Network.
 */
export async function GET() {
  try {
    // For now, return static tools from config
    // TODO: Fetch from AiMo Network API when endpoint is available
    return NextResponse.json({ data: TOOLS });
  } catch (error) {
    console.error("Failed to fetch tools:", error);
    return NextResponse.json(
      { error: "Failed to fetch tools" },
      { status: 500 },
    );
  }
}
