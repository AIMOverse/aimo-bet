import { tool } from "ai";
import { z } from "zod";

const ATLASCLOUD_API_URL =
  "https://api.atlascloud.ai/api/v1/model/generateVideo";
const ATLASCLOUD_PREDICTION_URL =
  "https://api.atlascloud.ai/api/v1/model/prediction";
const DEFAULT_MODEL = "alibaba/wan-2.6/text-to-video";

// Polling configuration
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 120; // 6 minutes max (3s * 120)

type PredictionStatus =
  | "starting"
  | "processing"
  | "completed"
  | "succeeded"
  | "failed";

interface PredictionResponse {
  code: number;
  data: {
    id: string;
    status: PredictionStatus;
    outputs?: string[];
    error?: string;
  };
}

async function pollForResult(
  predictionId: string,
  apiKey: string,
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    console.log(
      `[generateVideo] Polling attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS} for prediction ${predictionId}`,
    );

    const response = await fetch(
      `${ATLASCLOUD_PREDICTION_URL}/${predictionId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log("[generateVideo] Poll error response:", errorText);
      return {
        success: false,
        error: `AtlasCloud API poll error: ${response.status} - ${errorText}`,
      };
    }

    const data: PredictionResponse = await response.json();
    console.log("[generateVideo] Poll response status:", data.data?.status);

    const status = data.data?.status;

    if (status === "completed" || status === "succeeded") {
      const videoUrl = data.data?.outputs?.[0];
      if (!videoUrl) {
        return {
          success: false,
          error: "Video generation completed but no output URL returned",
        };
      }
      return {
        success: true,
        videoUrl,
      };
    }

    if (status === "failed") {
      return {
        success: false,
        error: data.data?.error || "Video generation failed",
      };
    }

    // Still processing, wait and retry
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return {
    success: false,
    error: "Video generation timed out after 6 minutes",
  };
}

export const generateVideoTool = tool({
  description:
    "Generate a video from a text prompt using AI. Creates cinematic videos from detailed scene descriptions.",
  inputSchema: z.object({
    prompt: z
      .string()
      .describe(
        "Detailed description of the video to generate. Include shot types, actions, lighting, and style details.",
      ),
    duration: z
      .number()
      .optional()
      .default(5)
      .describe("Video duration in seconds (default: 5)"),
    size: z
      .string()
      .optional()
      .default("1280*720")
      .describe("Video size as 'width*height' (e.g., '1920*1080', '1280*720')"),
    seed: z
      .number()
      .optional()
      .default(-1)
      .describe("Seed for reproducibility (-1 for random)"),
    negative_prompt: z
      .string()
      .optional()
      .describe("What to avoid in the video"),
    shot_type: z
      .enum(["single", "multi"])
      .optional()
      .default("single")
      .describe(
        "Shot type: 'single' for one continuous shot, 'multi' for multiple shots",
      ),
    enable_prompt_expansion: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to enhance the prompt with AI"),
    generate_audio: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to generate audio for the video"),
  }),
  execute: async ({
    prompt,
    duration,
    size,
    seed,
    negative_prompt,
    shot_type,
    enable_prompt_expansion,
    generate_audio,
  }) => {
    console.log("[generateVideo] execute() called with:", {
      prompt,
      duration,
      size,
      seed,
      negative_prompt,
      shot_type,
      enable_prompt_expansion,
      generate_audio,
    });

    const apiKey = process.env.ATLASCLOUD_API_KEY;
    if (!apiKey) {
      console.log("[generateVideo] ERROR: ATLASCLOUD_API_KEY not configured");
      return {
        success: false,
        error: "ATLASCLOUD_API_KEY not configured",
        prompt,
      };
    }
    console.log("[generateVideo] API key found, starting video generation...");

    try {
      const requestBody = {
        model: DEFAULT_MODEL,
        prompt,
        duration,
        size,
        seed,
        shot_type,
        enable_prompt_expansion,
        generate_audio,
        ...(negative_prompt && { negative_prompt }),
      };
      console.log(
        "[generateVideo] Request body:",
        JSON.stringify(requestBody, null, 2),
      );

      // Step 1: Start video generation
      const response = await fetch(ATLASCLOUD_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log("[generateVideo] Initial response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[generateVideo] API error response:", errorText);
        return {
          success: false,
          error: `AtlasCloud API error: ${response.status} - ${errorText}`,
          prompt,
        };
      }

      const data = await response.json();
      console.log(
        "[generateVideo] Initial API response:",
        JSON.stringify(data, null, 2),
      );

      // Extract prediction ID
      const predictionId = data.data?.id;
      if (!predictionId) {
        console.log("[generateVideo] No prediction ID in response");
        return {
          success: false,
          error: "No prediction ID returned from API",
          prompt,
        };
      }

      console.log("[generateVideo] Got prediction ID:", predictionId);

      // Step 2: Poll for result
      const result = await pollForResult(predictionId, apiKey);

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          prompt,
        };
      }

      console.log(
        "[generateVideo] Video generated successfully:",
        result.videoUrl,
      );

      return {
        success: true,
        video: {
          url: result.videoUrl,
          mediaType: "video/mp4",
        },
        prompt,
      };
    } catch (error) {
      console.log("[generateVideo] Catch error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        prompt,
      };
    }
  },
});
