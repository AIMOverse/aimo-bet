import { NextResponse } from "next/server";

const AGENTS = null;

/**
 * GET /api/agents
 *
 * Returns the list of available agents.
 * Currently returns static agents from config,
 * but can be extended to fetch from AiMo Network.
 */
export async function GET() {
  try {
    // For now, return static agents from config
    // TODO: Fetch from AiMo Network API when endpoint is available
    return NextResponse.json({ data: AGENTS });
  } catch (error) {
    console.error("Failed to fetch agents:", error);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 },
    );
  }
}
