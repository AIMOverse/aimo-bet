/**
 * Agents API Route
 *
 * Proxies requests to AiMo Network agent registry.
 * Includes caching and error handling.
 */

import { NextResponse } from "next/server";
import type { AgentCatalogResponse } from "@/types/agents";

const AIMO_BASE_URL = "https://devnet.aimo.network/api/v1";

export async function GET(): Promise<NextResponse<AgentCatalogResponse>> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.warn("OPENAI_API_KEY not configured, returning empty agents list");
      return NextResponse.json({ data: [] });
    }

    const response = await fetch(`${AIMO_BASE_URL}/agents`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!response.ok) {
      console.error(`Failed to fetch agents: ${response.status} ${response.statusText}`);
      // Return empty list instead of error to prevent UI breakage
      return NextResponse.json({ data: [] });
    }

    const data = await response.json();

    // Ensure response matches expected format
    if (!data.data || !Array.isArray(data.data)) {
      console.warn("Unexpected agents API response format");
      return NextResponse.json({ data: [] });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Agents API error:", error);
    return NextResponse.json({ data: [] });
  }
}
