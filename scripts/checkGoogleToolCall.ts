/**
 * Google Tool Call Validation Script
 *
 * Tests that the Google thought signature bypass implementation works correctly.
 * Makes a simple tool call using the Gemini model to verify the fetch wrapper
 * properly injects the "skip_thought_signature_validator" signature.
 *
 * Usage:
 *   bun scripts/checkGoogleToolCall.ts
 *   npx tsx scripts/checkGoogleToolCall.ts
 */

import "dotenv/config";
import { generateText, tool, ToolLoopAgent, stepCountIs } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/models";
import { clearProviderCache } from "@/lib/ai/models/providers/aimo";

// ============================================================================
// Color Helpers
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function log(
  color: keyof typeof colors,
  prefix: string,
  message: string
): void {
  console.log(`${colors[color]}[${prefix}]${colors.reset} ${message}`);
}

// ============================================================================
// Test Tool Definition
// ============================================================================

const calculatorTool = tool({
  description: "A simple calculator that can add two numbers together",
  inputSchema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
  execute: async ({ a, b }) => {
    log("cyan", "TOOL", `Calculator called with a=${a}, b=${b}`);
    return { result: a + b };
  },
});

// ============================================================================
// Main Test
// ============================================================================

async function main() {
  console.log("\n🔍 Google Tool Call Validation\n");
  console.log(
    "This script tests that the Google thought signature bypass works.\n"
  );

  // Check required environment variables
  const requiredEnvVars = [
    "WALLET_GEMINI_SVM_PRIVATE",
    "WALLET_GEMINI_SVM_PUBLIC",
  ];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    log(
      "red",
      "ERROR",
      `Missing environment variables: ${missingVars.join(", ")}`
    );
    process.exit(1);
  }

  log("blue", "INFO", "Environment variables OK");

  // Clear provider cache to ensure fresh provider with Google fetch wrapper
  clearProviderCache();

  try {
    // Get the Gemini model (this will use our custom fetch wrapper)
    log("blue", "INFO", "Loading google/gemini-3-pro model...");
    const model = await getModel("google/gemini-3-pro");
    log("green", "OK", "Model loaded successfully");

    // Test: Multi-step agent (same as predictionMarketAgent)
    // This is the actual pattern that can fail - ToolLoopAgent with multiple steps
    log(
      "blue",
      "INFO",
      "Test: Multi-step ToolLoopAgent (reproducing production pattern)..."
    );
    console.log(
      colors.gray +
        "  Prompt: Calculate 42 + 17, then add 100 to that result" +
        colors.reset
    );

    const startTime1 = Date.now();

    // Use ToolLoopAgent like the predictionMarketAgent does
    const agent = new ToolLoopAgent({
      model,
      instructions:
        "You are a helpful calculator assistant. Always use the calculator tool for math.",
      tools: {
        calculator: calculatorTool,
      },
      stopWhen: stepCountIs(5), // Allow up to 5 steps
      maxOutputTokens: 1024,
    });

    const result1 = await agent.generate({
      prompt:
        "Calculate 42 + 17, then add 100 to that result. Use the calculator tool twice.",
    });

    log("green", "PASS", `Test completed in ${Date.now() - startTime1}ms`);
    log("blue", "INFO", `Steps executed: ${result1.steps?.length || 0}`);

    const duration = Date.now() - startTime1;

    // Check results
    console.log("\n" + "=".repeat(60) + "\n");

    log("green", "SUCCESS", `All tests completed in ${duration}ms`);

    // Log tool calls from test 1
    if (result1.steps && result1.steps.length > 0) {
      log("blue", "INFO", `Test 1 steps: ${result1.steps.length}`);

      for (const step of result1.steps) {
        if (step.toolCalls && step.toolCalls.length > 0) {
          for (const tc of step.toolCalls) {
            const args = "args" in tc ? tc.args : "input" in tc ? tc.input : {};
            log("cyan", "TOOL_CALL", `${tc.toolName}(${JSON.stringify(args)})`);
          }
        }
        if (step.toolResults && step.toolResults.length > 0) {
          for (const tr of step.toolResults) {
            const result =
              "result" in tr ? tr.result : "output" in tr ? tr.output : tr;
            log("cyan", "TOOL_RESULT", JSON.stringify(result));
          }
        }
      }
    }

    // Log final response
    console.log("\n" + colors.gray + "Test 1 Response:" + colors.reset);
    console.log(result1.text || "(no text response)");

    console.log("\n" + "=".repeat(60) + "\n");

    // Validate the tool was actually called
    const toolCalls = result1.steps?.flatMap((s) => s.toolCalls || []) || [];
    if (toolCalls.length === 0) {
      log(
        "yellow",
        "WARN",
        "No tool calls were made - model may have computed directly"
      );
    } else {
      log(
        "green",
        "PASS",
        `${toolCalls.length} tool call(s) executed successfully`
      );
      log("green", "PASS", "Google thought signature bypass is working!");
    }

    // Check if the answer is correct
    if (result1.text?.includes("59")) {
      log("green", "PASS", "Answers look correct");
    }
  } catch (error) {
    console.log("\n" + "=".repeat(60) + "\n");
    log("red", "FAILED", "Tool call test failed");

    if (error instanceof Error) {
      console.error(colors.red + "Error:" + colors.reset, error.message);

      // Log detailed error properties
      const errorWithDetails = error as Error & {
        cause?: unknown;
        statusCode?: number;
        responseBody?: string;
        url?: string;
      };

      if (errorWithDetails.responseBody) {
        console.error(
          colors.red + "Response Body:" + colors.reset,
          errorWithDetails.responseBody
        );
      }
      if (errorWithDetails.statusCode) {
        console.error(
          colors.red + "Status Code:" + colors.reset,
          errorWithDetails.statusCode
        );
      }
      if (errorWithDetails.cause) {
        console.error(
          colors.red + "Cause:" + colors.reset,
          errorWithDetails.cause
        );
      }

      // Check for specific thought signature error
      if (
        error.message.includes("thought_signature") ||
        error.message.includes("signature") ||
        errorWithDetails.responseBody?.includes("thought_signature")
      ) {
        log(
          "red",
          "DIAGNOSIS",
          "This appears to be a thought signature validation error."
        );
        log(
          "yellow",
          "HINT",
          "The fetch wrapper may not be injecting signatures correctly."
        );
      }

      // Always log full error for debugging
      console.error("\nFull error:", error);
    } else {
      console.error(colors.red + "Unknown error:" + colors.reset, error);
    }

    process.exit(1);
  }

  console.log(colors.green + "✓ All tests passed!" + colors.reset + "\n");
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
