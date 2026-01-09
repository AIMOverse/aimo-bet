/**
 * PredictionMarketAgent - AI-SDK based trading agent
 *
 * Uses ToolLoopAgent (NOT durable) for LLM reasoning and tool execution.
 * Tools execute once without retry - critical for placeOrder to prevent duplicates.
 *
 * This agent is designed to be wrapped in a durable step in the workflow layer,
 * but the agent internals (LLM calls, tool executions) are NOT durable.
 *
 * KV Cache Optimization:
 * - Static system prompt (cacheable across runs)
 * - Agent fetches balance via getBalance tool (appends to cache, doesn't invalidate)
 * - No dynamic user prompt with balance/signals
 */

import { ToolLoopAgent, stepCountIs } from "ai";
import { nanoid } from "nanoid";
import { type KeyPairSigner } from "@solana/kit";
import { getModel } from "@/lib/ai/models";
import { createSignerFromBase58SecretKey } from "@/lib/solana/wallets";
import { TRADING_SYSTEM_PROMPT } from "@/lib/ai/prompts/systemPrompt";

// Direct tool imports
import { discoverMarketTool } from "@/lib/ai/tools/discover";
import { createIncreasePositionTool } from "@/lib/ai/tools/increasePosition";
import { createDecreasePositionTool } from "@/lib/ai/tools/decreasePosition";
import { createRetrievePositionTool } from "@/lib/ai/tools/retrievePosition";
import { createRedeemPositionTool } from "@/lib/ai/tools/redeemPosition";
import { createGetBalanceTool } from "@/lib/ai/tools/getBalance";
import { webSearchTool } from "@/lib/ai/tools/webSearch";

import type {
  AgentConfig,
  AgentRunInput,
  TradingResult,
  ExecutedTrade,
} from "./types";
import type {
  DecisionType,
  PositionSide,
  TradeAction,
} from "@/lib/supabase/types";

export class PredictionMarketAgent {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Run the agent to analyze market and potentially execute trades.
   *
   * IMPORTANT: Tools execute once without retry.
   * - placeOrder is fire-once to prevent duplicate orders
   * - If agent fails mid-execution, the entire run should be restarted
   *   (handled by the durable workflow wrapper)
   *
   * KV Cache Optimization:
   * - Static system prompt (TRADING_SYSTEM_PROMPT) is cacheable
   * - Agent fetches balance via getBalance tool (appends to cache)
   * - User prompt is static ("Analyze markets...")
   */
  async run(_input: AgentRunInput): Promise<TradingResult> {
    // Create signer from private key if available
    let signer: KeyPairSigner | undefined;
    if (this.config.privateKey) {
      signer = await createSignerFromBase58SecretKey(this.config.privateKey);
    }

    // Create tools directly with wallet context
    const tools = {
      getBalance: createGetBalanceTool(this.config.walletAddress),
      discoverMarket: discoverMarketTool,
      increasePosition: createIncreasePositionTool(
        this.config.walletAddress,
        signer
      ),
      decreasePosition: createDecreasePositionTool(
        this.config.walletAddress,
        signer
      ),
      retrievePosition: createRetrievePositionTool(this.config.walletAddress),
      redeemPosition: createRedeemPositionTool(
        this.config.walletAddress,
        signer
      ),
      webSearch: webSearchTool,
    };

    // Get the model instance with detailed error logging
    console.log(
      `[PredictionMarketAgent:${this.config.modelId}] Getting model instance...`
    );

    let model;
    try {
      model = await getModel(this.config.modelId);
      console.log(
        `[PredictionMarketAgent:${this.config.modelId}] Model instance created successfully`
      );
    } catch (modelError) {
      console.error(
        `[PredictionMarketAgent:${this.config.modelId}] Failed to get model:`,
        modelError
      );
      throw modelError;
    }

    // Create ToolLoopAgent for this run
    // - maxSteps: Limits LLM roundtrips (default 5, hard cap at 10)
    // - maxOutputTokens: Limits verbose reasoning (saves inference cost)
    const agent = new ToolLoopAgent({
      model,
      instructions: TRADING_SYSTEM_PROMPT,
      tools,
      stopWhen: stepCountIs(Math.min(this.config.maxSteps ?? 5, 10)),
      maxOutputTokens: 1024,
    });

    // Static prompt for KV cache optimization
    // Agent will call getBalance tool to get current balance
    const prompt =
      "Analyze prediction markets and execute trades if you find opportunities with >70% confidence.";

    console.log(
      `[PredictionMarketAgent:${this.config.modelId}] Starting agent run`
    );

    // Run the agent with ToolLoopAgent.generate()
    // This is NOT durable - tools fire once without retry
    let result;
    try {
      result = await agent.generate({ prompt });
    } catch (agentError: unknown) {
      // Log detailed error information for debugging
      const error = agentError as Error & {
        cause?: unknown;
        statusCode?: number;
        responseBody?: string;
        url?: string;
        requestBodyValues?: unknown;
      };
      console.error(
        `[PredictionMarketAgent:${this.config.modelId}] Agent generate failed:`,
        {
          message: error.message,
          name: error.name,
          cause: error.cause,
          statusCode: error.statusCode,
          responseBody: error.responseBody,
          url: error.url,
          requestBodyValues: error.requestBodyValues,
          stack: error.stack,
        }
      );
      throw agentError;
    }

    console.log(
      `[PredictionMarketAgent:${this.config.modelId}] Completed with ${result.steps.length} steps`
    );

    // Extract trades from tool call results
    const trades = this.extractTrades(result.steps);

    // Determine decision type from results
    const decision = this.determineDecision(result.text, trades);

    // Get market info from trades
    const marketTicker = trades[0]?.marketTicker;
    const marketTitle = trades[0]?.marketTitle;

    // Extract balance from getBalance tool result if available
    const portfolioValue = this.extractBalanceFromSteps(result.steps);

    // Extract reasoning: use result.text or gather text from steps
    const reasoning = this.extractReasoning(result.text, result.steps);

    return {
      reasoning,
      trades,
      decision,
      steps: result.steps.length,
      portfolioValue,
      marketTicker,
      marketTitle,
    };
  }

  /**
   * Extract reasoning from agent result.
   * Uses result.text if available, otherwise collects text from individual steps.
   */
  private extractReasoning(
    finalText: string | undefined,
    steps: Array<{ text?: string }>
  ): string {
    // If we have final text, use it
    if (finalText && finalText.trim()) {
      return finalText;
    }

    // Gather text from all steps
    const stepTexts = steps
      .map((s) => s.text)
      .filter((t): t is string => !!t && t.trim() !== "")
      .join("\n\n");

    if (stepTexts) {
      return stepTexts;
    }

    return "Agent completed without generating reasoning.";
  }

  /**
   * Extract executed trades from agent steps.
   * Looks for successful increasePosition/decreasePosition tool calls and their results.
   */
  private extractTrades(
    steps: Array<{
      toolCalls?: Array<{
        toolName: string;
        toolCallId: string;
        input: unknown;
      }>;
      toolResults?: Array<{ toolCallId: string; output?: unknown }>;
    }>
  ): ExecutedTrade[] {
    const trades: ExecutedTrade[] = [];

    for (const step of steps) {
      if (!step.toolCalls || !step.toolResults) continue;

      for (const call of step.toolCalls) {
        // Handle increasePosition tool
        if (call.toolName === "increasePosition") {
          const resultEntry = step.toolResults.find(
            (r) => r.toolCallId === call.toolCallId
          );

          const typedOutput = resultEntry?.output as
            | {
                success?: boolean;
                signature?: string;
                filled_quantity?: number;
                avg_price?: number;
                total_cost?: number;
              }
            | undefined;

          if (typedOutput?.success) {
            const input = call.input as {
              market_ticker: string;
              side: "yes" | "no";
              usdc_amount?: number;
              quantity?: number;
            };

            trades.push({
              id: typedOutput.signature || nanoid(),
              marketTicker: input.market_ticker,
              marketTitle: input.market_ticker,
              side: input.side as PositionSide,
              action: "buy" as TradeAction,
              quantity: typedOutput.filled_quantity || input.quantity || 0,
              price: typedOutput.avg_price || 0,
              notional: typedOutput.total_cost || 0,
            });
          }
        }

        // Handle decreasePosition tool
        if (call.toolName === "decreasePosition") {
          const resultEntry = step.toolResults.find(
            (r) => r.toolCallId === call.toolCallId
          );

          const typedOutput = resultEntry?.output as
            | {
                success?: boolean;
                signature?: string;
                sold_quantity?: number;
                avg_price?: number;
                total_proceeds?: number;
              }
            | undefined;

          if (typedOutput?.success) {
            const input = call.input as {
              market_ticker: string;
              side: "yes" | "no";
              quantity: number;
            };

            trades.push({
              id: typedOutput.signature || nanoid(),
              marketTicker: input.market_ticker,
              marketTitle: input.market_ticker,
              side: input.side as PositionSide,
              action: "sell" as TradeAction,
              quantity: typedOutput.sold_quantity || input.quantity,
              price: typedOutput.avg_price || 0,
              notional: typedOutput.total_proceeds || 0,
            });
          }
        }
      }
    }

    return trades;
  }

  /**
   * Determine the decision type from agent results.
   */
  private determineDecision(
    text: string | undefined,
    trades: ExecutedTrade[]
  ): DecisionType {
    if (trades.length > 0) {
      return trades[0].action === "buy" ? "buy" : "sell";
    }

    const reasoning = (text || "").toLowerCase();
    if (
      reasoning.includes("skip") ||
      reasoning.includes("no trading opportunity") ||
      reasoning.includes("insufficient confidence")
    ) {
      return "skip";
    }

    return "hold";
  }

  /**
   * Extract USDC balance from getBalance tool result in agent steps.
   * Returns 0 if not found.
   */
  private extractBalanceFromSteps(
    steps: Array<{
      toolCalls?: Array<{
        toolName: string;
        toolCallId: string;
        input: unknown;
      }>;
      toolResults?: Array<{ toolCallId: string; output?: unknown }>;
    }>
  ): number {
    for (const step of steps) {
      if (!step.toolCalls || !step.toolResults) continue;

      for (const call of step.toolCalls) {
        if (call.toolName === "getBalance") {
          const resultEntry = step.toolResults.find(
            (r) => r.toolCallId === call.toolCallId
          );

          const typedOutput = resultEntry?.output as
            | { success?: boolean; balance?: number }
            | undefined;

          if (typedOutput?.success && typeof typedOutput.balance === "number") {
            return typedOutput.balance;
          }
        }
      }
    }

    return 0;
  }
}
