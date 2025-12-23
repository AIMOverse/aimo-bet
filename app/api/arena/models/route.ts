import { NextResponse } from "next/server";
import {
  getArenaModels,
  getArenaModel,
  createArenaModel,
  updateArenaModel,
} from "@/lib/supabase/arena";
import { DEFAULT_CHART_COLOR } from "@/lib/arena/constants";

// ============================================================================
// GET /api/arena/models - List models or get specific model
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const all = searchParams.get("all");

    // Get specific model
    if (id) {
      const model = await getArenaModel(id);
      if (!model) {
        return NextResponse.json(
          { error: "Model not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(model);
    }

    // List models (optionally include disabled)
    const enabledOnly = all !== "true";
    const models = await getArenaModels(enabledOnly);
    return NextResponse.json(models);
  } catch (error) {
    console.error("Failed to get models:", error);
    return NextResponse.json(
      { error: "Failed to get models" },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST /api/arena/models - Create new model
// ============================================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      provider,
      modelIdentifier,
      avatarUrl,
      chartColor = DEFAULT_CHART_COLOR,
      enabled = true,
    } = body;

    if (!name || !provider || !modelIdentifier) {
      return NextResponse.json(
        { error: "name, provider, and modelIdentifier are required" },
        { status: 400 }
      );
    }

    const model = await createArenaModel({
      name,
      provider,
      modelIdentifier,
      avatarUrl,
      chartColor,
      enabled,
    });

    return NextResponse.json(model, { status: 201 });
  } catch (error) {
    console.error("Failed to create model:", error);
    return NextResponse.json(
      { error: "Failed to create model" },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH /api/arena/models - Update model
// ============================================================================

export async function PATCH(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Model ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, provider, modelIdentifier, avatarUrl, chartColor, enabled } = body;

    await updateArenaModel(id, {
      name,
      provider,
      modelIdentifier,
      avatarUrl,
      chartColor,
      enabled,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update model:", error);
    return NextResponse.json(
      { error: "Failed to update model" },
      { status: 500 }
    );
  }
}
