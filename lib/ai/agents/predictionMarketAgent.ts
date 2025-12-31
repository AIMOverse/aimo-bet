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
import { createAgentTools } from "@/lib/ai/tools";
import { createSignerFromBase58PrivateKey } from "@/lib/solana/signer";
import { TRADING_SYSTEM_PROMPT } from "@/lib/ai/prompts/trading/systemPrompt";
import {
  buildContextPrompt,
  type ContextPromptInput,
} from "@/lib/ai/prompts/trading/contextBuilder";
import type {
  AgentConfig,
  MarketContext,
  MarketSignal,
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
  async run(
    context: MarketContext,
    signal?: MarketSignal,
  ): Promise<TradingResult> {
    // Create signer from private key if available
    let signer: KeyPairSigner | undefined;
    if (this.config.privateKey) {
      signer = await createSignerFromBase58PrivateKey(this.config.privateKey);
    }

    // Create tools with wallet context
    const tools = await createAgentTools(this.config.walletAddress, signer);

    // Create ToolLoopAgent for this run
    const agent = new ToolLoopAgent({
      model: getModel(this.config.modelId),
      instructions: TRADING_SYSTEM_PROMPT,
      tools,
      stopWhen: stepCountIs(this.config.maxSteps ?? 10),
    });

    // Build context prompt from market data
    const contextSignal = signal
      ? {
          type: signal.type as
            | "price_swing"
            | "volume_spike"
            | "orderbook_imbalance",
          ticker: signal.ticker,
          data: signal.data,
          timestamp: signal.timestamp,
        }
      : undefined;

    const promptInput: ContextPromptInput = {
      availableMarkets: context.availableMarkets.map((m) => ({
        ticker: m.ticker,
        title: m.title,
        yesPrice: m.yesPrice,
        noPrice: m.noPrice,
        volume: m.volume,
        status: m.status as "open" | "closed" | "settled",
      })),
      portfolio: {
        cashBalance: context.portfolio.cashBalance,
        totalValue: context.portfolio.totalValue,
        positions: context.portfolio.positions.map((p) => ({
          marketTicker: p.marketTicker,
          marketTitle: p.marketTitle,
          side: p.side,
          quantity: p.quantity,
        })),
      },
      recentTrades: context.recentTrades.map((t) => ({
        marketTicker: t.marketTicker,
        side: t.side,
        action: t.action,
        quantity: t.quantity,
        price: t.price,
      })),
      priceSwings: context.priceSwings,
      signal: contextSignal,
    };

    const prompt = buildContextPrompt(promptInput);

    console.log(
      `[PredictionMarketAgent:${this.config.modelId}] Starting agent run`,
    );

    // Run the agent with ToolLoopAgent.generate()
    // This is NOT durable - tools fire once without retry
    const result = await agent.generate({ prompt });

    console.log(
      `[PredictionMarketAgent:${this.config.modelId}] Completed with ${result.steps.length} steps`,
    );

    // Extract trades from tool call results
    const trades = this.extractTrades(result.steps);

    // Determine decision type from results
    const decision = this.determineDecision(result.text, trades);

    // Get market info from trades or signal
    const marketTicker =
      signal?.ticker ||
      trades[0]?.marketTicker ||
      context.priceSwings[0]?.ticker;
    const marketTitle = trades[0]?.marketTitle;

    return {
      reasoning: result.text || "No reasoning provided.",
      trades,
      decision,
      steps: result.steps.length,
      portfolioValue: context.portfolio.totalValue,
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
        // Handle new position tools
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

        // Legacy support for placeOrder (during migration)
        if (call.toolName === "placeOrder") {
          const resultEntry = step.toolResults.find(
            (r) => r.toolCallId === call.toolCallId,
          );

          const typedOutput = resultEntry?.output as
            | {
                success?: boolean;
                order?: { id?: string; price?: number };
              }
            | undefined;

          if (typedOutput?.success) {
            const input = call.input as {
              market_ticker: string;
              side: "yes" | "no";
              action: "buy" | "sell";
              quantity: number;
              limit_price?: number;
            };
            const price = typedOutput.order?.price || input.limit_price || 0;

            trades.push({
              id: typedOutput.order?.id || nanoid(),
              marketTicker: input.market_ticker,
              marketTitle: input.market_ticker,
              side: input.side as PositionSide,
              action: input.action as TradeAction,
              quantity: input.quantity,
              price,
              notional: input.quantity * price,
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
