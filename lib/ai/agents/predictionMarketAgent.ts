/**
 * PredictionMarketAgent - AI-SDK based trading agent
 *
 * Uses ToolLoopAgent (NOT durable) for LLM reasoning and tool execution.
 * Tools execute once without retry - critical for placeOrder to prevent duplicates.
 *
 * This agent is designed to be wrapped in a durable step in the workflow layer,
 * but the agent internals (LLM calls, tool executions) are NOT durable.
 */

import { ToolLoopAgent, stepCountIs } from "ai";
import { nanoid } from "nanoid";
import { type KeyPairSigner } from "@solana/kit";
import { getModel } from "@/lib/ai/models";
import { createSignerFromBase58SecretKey } from "@/lib/solana/wallets";
import { TRADING_SYSTEM_PROMPT } from "@/lib/ai/prompts/trading/systemPrompt";
import {
  buildTradingPrompt,
  buildTestPrompt,
  type TradingPromptInput,
} from "@/lib/ai/prompts/trading/promptBuilder";

// Direct tool imports
import { discoverEventTool } from "@/lib/ai/tools/discoverEvent";
import { createIncreasePositionTool } from "@/lib/ai/tools/increasePosition";
import { createDecreasePositionTool } from "@/lib/ai/tools/decreasePosition";
import { createRetrievePositionTool } from "@/lib/ai/tools/retrievePosition";
import { createRedeemPositionTool } from "@/lib/ai/tools/redeemPosition";

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
   */
  async run(input: AgentRunInput): Promise<TradingResult> {
    // Create signer from private key if available
    let signer: KeyPairSigner | undefined;
    if (this.config.privateKey) {
      signer = await createSignerFromBase58SecretKey(this.config.privateKey);
    }

    // Create tools directly with wallet context
    const tools = {
      discoverEvent: discoverEventTool,
      increasePosition: createIncreasePositionTool(
        this.config.walletAddress,
        signer,
      ),
      decreasePosition: createDecreasePositionTool(
        this.config.walletAddress,
        signer,
      ),
      retrievePosition: createRetrievePositionTool(this.config.walletAddress),
      redeemPosition: createRedeemPositionTool(
        this.config.walletAddress,
        signer,
      ),
    };

    // Create ToolLoopAgent for this run
    const agent = new ToolLoopAgent({
      model: getModel(this.config.modelId),
      instructions: TRADING_SYSTEM_PROMPT,
      tools,
      stopWhen: stepCountIs(this.config.maxSteps ?? 10),
    });

    // Build prompt based on mode
    let prompt: string;

    if (input.testMode) {
      // Test mode: force a small trade
      prompt = buildTestPrompt(input.usdcBalance);
    } else {
      // Normal mode: signal-based or periodic
      const promptInput: TradingPromptInput = {
        signal: input.signal
          ? {
              type: input.signal.type as
                | "price_swing"
                | "volume_spike"
                | "orderbook_imbalance",
              ticker: input.signal.ticker,
              data: input.signal.data,
              timestamp: input.signal.timestamp,
            }
          : undefined,
        usdcBalance: input.usdcBalance,
      };
      prompt = buildTradingPrompt(promptInput);
    }

    console.log(
      `[PredictionMarketAgent:${this.config.modelId}] Starting agent run with prompt:`,
      prompt,
    );

    // Run the agent with ToolLoopAgent.generate()
    // This is NOT durable - tools fire once without retry
    const result = await agent.generate({ prompt });

    console.log(
      `[PredictionMarketAgent:${this.config.modelId}] Raw result keys:`,
      Object.keys(result),
    );

    console.log(
      `[PredictionMarketAgent:${this.config.modelId}] Completed with ${result.steps.length} steps`,
    );

    // Log the full inference response for debugging
    console.log(
      `[PredictionMarketAgent:${this.config.modelId}] Agent Response:`,
      JSON.stringify(
        {
          text: result.text,
          steps: result.steps.map((step, i) => ({
            step: i + 1,
            toolCalls: step.toolCalls?.map((tc) => ({
              tool: tc.toolName,
              input: tc.input,
            })),
            toolResults: step.toolResults?.map((tr) => ({
              id: tr.toolCallId,
              output: tr.output,
            })),
          })),
        },
        null,
        2,
      ),
    );

    // Extract trades from tool call results
    const trades = this.extractTrades(result.steps);

    // Determine decision type from results
    const decision = this.determineDecision(result.text, trades);

    // Get market info from trades or signal
    const marketTicker = input.signal?.ticker || trades[0]?.marketTicker;
    const marketTitle = trades[0]?.marketTitle;

    return {
      reasoning: result.text || "No reasoning provided.",
      trades,
      decision,
      steps: result.steps.length,
      portfolioValue: input.usdcBalance,
      marketTicker,
      marketTitle,
    };
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
    }>,
  ): ExecutedTrade[] {
    const trades: ExecutedTrade[] = [];

    for (const step of steps) {
      if (!step.toolCalls || !step.toolResults) continue;

      for (const call of step.toolCalls) {
        // Handle increasePosition tool
        if (call.toolName === "increasePosition") {
          const resultEntry = step.toolResults.find(
            (r) => r.toolCallId === call.toolCallId,
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
            (r) => r.toolCallId === call.toolCallId,
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
    trades: ExecutedTrade[],
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
}
