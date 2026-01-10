// ============================================================================
// deepResearch Tool
// Comprehensive research using Parallel Task API
// Async execution with webhook notification
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { createResearchTask } from "@/lib/parallel/client";
import { createPendingResearch } from "@/lib/supabase/research";
import type { Processor } from "@/lib/parallel/types";
import type { DeepResearchOutput } from "./types";

// ============================================================================
// Processor Schema
// ============================================================================

const processorSchema = z.enum([
  "lite",
  "lite-fast",
  "base",
  "base-fast",
  "core",
  "core-fast",
  "core2x",
  "pro",
  "pro-fast",
  "ultra",
  "ultra-fast",
  "ultra2x",
  "ultra4x",
  "ultra8x",
]);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build research input with market context
 */
function buildResearchInput(
  researchQuestion: string,
  marketId?: string,
  marketTitle?: string
): string {
  let input = researchQuestion;

  if (marketId || marketTitle) {
    input += "\n\n---\nMarket Context:";
    if (marketTitle) {
      input += `\nMarket: ${marketTitle}`;
    }
    if (marketId) {
      input += `\nMarket ID: ${marketId}`;
    }
  }

  return input;
}

// ============================================================================
// Tool Definition
// ============================================================================

/**
 * Deep Research Tool
 * Comprehensive research reports with citations
 * Async execution - returns immediately with run_id
 * Results delivered via webhook
 */
export const deepResearchTool = tool({
  description:
    "Launch comprehensive research on a topic using AI-powered web research. " +
    "Returns immediately with a run_id - results are delivered asynchronously via webhook. " +
    "Use for in-depth analysis requiring multiple sources and cross-referencing. " +
    "Processing time: 1-50 minutes depending on processor tier.",
  inputSchema: z.object({
    research_question: z
      .string()
      .max(15000)
      .describe(
        "Natural language research task. Be specific about what information you need."
      ),
    market_id: z
      .string()
      .optional()
      .describe("Optional market ID for context"),
    market_title: z
      .string()
      .optional()
      .describe("Optional market title for context"),
    processor: processorSchema
      .optional()
      .default("pro-fast")
      .describe(
        "Processing tier. pro-fast (default) is good for most cases. " +
          "Use ultra tiers for complex/difficult research."
      ),
  }),
  execute: async ({
    research_question,
    market_id,
    market_title,
    processor = "pro-fast",
  }): Promise<DeepResearchOutput> => {
    console.log("[deepResearch] Executing:", {
      research_question: research_question.slice(0, 100) + "...",
      market_id,
      market_title,
      processor,
    });

    try {
      const input = buildResearchInput(
        research_question,
        market_id,
        market_title
      );

      // Create the research task
      const taskResponse = await createResearchTask({
        input,
        processor: processor as Processor,
      });

      console.log("[deepResearch] Task created:", {
        run_id: taskResponse.run_id,
      });

      // Track pending task in Supabase
      try {
        await createPendingResearch(taskResponse.run_id);
      } catch (dbError) {
        // Non-fatal - task will still complete, just not tracked
        console.warn(
          "[deepResearch] Failed to track pending task:",
          dbError
        );
      }

      return {
        success: true,
        run_id: taskResponse.run_id,
        status: "pending",
        message:
          "Research task submitted. Results will be delivered via webhook when complete. " +
          `Estimated time: ${getEstimatedTime(processor)}.`,
      };
    } catch (error) {
      console.error("[deepResearch] Error:", error);
      return {
        success: false,
        run_id: "",
        status: "pending",
        message: "Failed to submit research task",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============================================================================
// Helper: Estimated Time
// ============================================================================

function getEstimatedTime(processor: string): string {
  switch (processor) {
    case "lite":
    case "lite-fast":
      return "10-60 seconds";
    case "base":
    case "base-fast":
      return "15-100 seconds";
    case "core":
    case "core-fast":
    case "core2x":
      return "30 seconds - 5 minutes";
    case "pro":
    case "pro-fast":
      return "1-10 minutes";
    case "ultra":
    case "ultra-fast":
      return "2-25 minutes";
    case "ultra2x":
      return "5-50 minutes";
    case "ultra4x":
      return "5-90 minutes";
    case "ultra8x":
      return "5 minutes - 2 hours";
    default:
      return "1-10 minutes";
  }
}

// ============================================================================
// Factory Function (for dependency injection)
// ============================================================================

/**
 * Create a deep research tool instance
 * Factory pattern for potential future customization
 */
export function createDeepResearchTool() {
  return deepResearchTool;
}
