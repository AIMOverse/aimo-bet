import { NextResponse } from "next/server";
import { MODELS } from "@/config/models";

/**
 * GET /api/models
 *
 * Returns the list of available models.
 * Currently returns static models from config,
 * but can be extended to fetch from AiMo Network.
 */
export async function GET() {
  try {
    // For now, return static models from config
    // TODO: Fetch from AiMo Network API when endpoint is available
    return NextResponse.json({ data: MODELS });
  } catch (error) {
    console.error("Failed to fetch models:", error);
    return NextResponse.json(
      { error: "Failed to fetch models" },
      { status: 500 }
    );
  }
}
