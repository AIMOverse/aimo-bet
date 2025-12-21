import { tool } from "ai";
import { z } from "zod";

const MEGANOVA_API_URL = "https://api.meganova.ai/v1/images/generation";
const DEFAULT_MODEL = "Bytedance/seedream-4-5-251128";

// Meganova requires total pixels between 3,686,400 and 16,777,216
// Default 1920x1920 = 3,686,400 (minimum allowed)
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1920;

export const generateImageTool = tool({
  description:
    "Generate an image from a text prompt using AI. Can also transform an existing image by providing a source image URL.",
  inputSchema: z.object({
    prompt: z
      .string()
      .describe("Detailed description of the image to generate"),
    width: z
      .number()
      .optional()
      .default(DEFAULT_WIDTH)
      .describe("Image width in pixels (minimum ~1920 for square images)"),
    height: z
      .number()
      .optional()
      .default(DEFAULT_HEIGHT)
      .describe("Image height in pixels (minimum ~1920 for square images)"),
    seed: z
      .number()
      .optional()
      .default(-1)
      .describe("Seed for reproducibility (-1 for random)"),
    image: z
      .string()
      .url()
      .optional()
      .describe(
        "URL of source image for style transfer or image-to-image transformation",
      ),
  }),
  execute: async ({ prompt, width, height, seed, image }) => {
    console.log("[generateImage] execute() called with:", {
      prompt,
      width,
      height,
      seed,
      image,
    });

    const apiKey = process.env.MEGANOVA_API_KEY;
    if (!apiKey) {
      console.log("[generateImage] ERROR: MEGANOVA_API_KEY not configured");
      return {
        success: false,
        error: "MEGANOVA_API_KEY not configured",
        prompt,
      };
    }
    console.log("[generateImage] API key found, making request to Meganova...");

    try {
      const requestBody = {
        model: DEFAULT_MODEL,
        prompt,
        width,
        height,
        seed,
        ...(image && { image }),
      };
      console.log(
        "[generateImage] Request body:",
        JSON.stringify(requestBody, null, 2),
      );

      const response = await fetch(MEGANOVA_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log("[generateImage] Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("[generateImage] API error response:", errorText);
        return {
          success: false,
          error: `Meganova API error: ${response.status} - ${errorText}`,
          prompt,
        };
      }

      const data = await response.json();
      console.log(
        "[generateImage] Full API response:",
        JSON.stringify(data, null, 2).slice(0, 1000),
      );

      // Handle array error responses (Meganova returns errors as array with status 200)
      if (Array.isArray(data)) {
        const errorMsg = data[0]?.msg || "Unknown API error";
        console.log("[generateImage] API returned error array:", errorMsg);
        return {
          success: false,
          error: errorMsg,
          prompt,
        };
      }

      // Extract image from response - Meganova returns { status, data: [{ b64_json }] }
      const imageBase64 = data.data?.[0]?.b64_json;

      // Check if image data exists
      if (!imageBase64) {
        console.log("[generateImage] No image in response");
        return {
          success: false,
          error: "No image returned from API",
          prompt,
        };
      }

      console.log(
        "[generateImage] API success, image base64 length:",
        imageBase64.length,
      );

      return {
        success: true,
        image: {
          base64: imageBase64,
          mediaType: "image/jpeg",
        },
        prompt,
        revisedPrompt: data.revised_prompt,
      };
    } catch (error) {
      console.log("[generateImage] Catch error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        prompt,
      };
    }
  },
});
