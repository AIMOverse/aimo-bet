import { generateText, stepCountIs, type StepResult, type ToolSet } from "ai";
import { getModel } from "@/lib/ai/models";
import { nanoid } from "nanoid";
import type {
  PredictionMarketAgentConfig,
  MarketContext,
  Trade,
  PositionSide,
  TradeAction,
} from "@/types/db";
import type { ChatMessage, ChatMessageType } from "@/types/chat";
import { saveChatMessage } from "@/lib/supabase/db";
import { createAgentTools, type AgentTools } from "@/lib/ai/tools";
import {
  TRADING_SYSTEM_PROMPT,
  buildContextPrompt,
} from "./prompts/tradingPrompt";

// ============================================================================
// Types
// ============================================================================

/**
 * Result from executing the trading loop
 */
export interface AgentExecutionResult {
  reasoning: string;
  trades: Trade[];
  steps: AgentStep[];
}

/**
 * A step in the agent's execution
 */
export interface AgentStep {
  stepNumber: number;
  text?: string;
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
}

/**
 * Price swing information
 */
export interface PriceSwing {
  ticker: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
}

// ============================================================================
// PREDICTION MARKET AGENT
// ============================================================================

/**
 * Prediction market trading agent using AI SDK agentic loop.
 * Instantiated per model, encapsulates wallet and session context.
 */
export class PredictionMarketAgent {
  protected config: PredictionMarketAgentConfig;
  protected tools: AgentTools;

  constructor(config: PredictionMarketAgentConfig) {
    this.config = config;
    // Create tools with wallet context injected
    this.tools = createAgentTools(
      config.walletAddress,
      config.walletPrivateKey
    );
  }

  /**
   * Main agentic loop - LLM autonomously decides what to do.
   * Uses AI SDK generateText with tools and stopWhen for multi-step reasoning.
   */
  async executeTradingLoop(
    context: MarketContext,
    priceSwings?: PriceSwing[]
  ): Promise<AgentExecutionResult> {
    const model = getModel(this.config.modelIdentifier);

    console.log(
      `[Agent:${this.config.modelId}] Starting trading loop with ${context.availableMarkets.length} markets`
    );

    // Build context for the prompt
    const contextPrompt = buildContextPrompt({
      availableMarkets: context.availableMarkets.map((m) => ({
        ticker: m.ticker,
        title: m.title,
        yesPrice: m.yesPrice,
        noPrice: m.noPrice,
        volume: m.volume,
        status: m.status,
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
      priceSwings,
    });

    try {
      const result = await generateText({
        model,
        system: this.getSystemPrompt(),
        prompt: contextPrompt,
        tools: this.tools,
        stopWhen: stepCountIs(5),
        onStepFinish: (step) => {
          console.log(`[Agent:${this.config.modelId}] Step finished:`, {
            hasText: !!step.text,
            toolCallCount: step.toolCalls?.length ?? 0,
          });
          if (step.toolCalls && step.toolCalls.length > 0) {
            for (const call of step.toolCalls) {
              console.log(`[Agent:${this.config.modelId}] Tool call: ${call.toolName}`);
            }
          }
        },
      });

      // Extract steps information
      const steps = this.extractSteps(result.steps);

      // Extract trades from tool call results
      const trades = this.extractTradesFromSteps(result.steps);

      // Get the final reasoning text
      const reasoning = result.text || "No reasoning provided.";

      console.log(
        `[Agent:${this.config.modelId}] Trading loop complete. Trades: ${trades.length}`
      );

      // Save broadcast to chat
      const messageType: ChatMessageType =
        trades.length > 0 ? "trade" : "commentary";
      await this.saveMessage(reasoning, messageType, trades[0]?.id);

      return { reasoning, trades, steps };
    } catch (error) {
      console.error(`[Agent:${this.config.modelId}] Trading loop error:`, error);

      // Save error message
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      await this.saveMessage(
        `Trading analysis failed: ${errorMessage}`,
        "commentary"
      );

      return {
        reasoning: `Error: ${errorMessage}`,
        trades: [],
        steps: [],
      };
    }
  }

  /**
   * System prompt defining agent behavior and guidelines.
   */
  protected getSystemPrompt(): string {
    return TRADING_SYSTEM_PROMPT;
  }

  /**
   * Extract steps from the generateText result
   */
  protected extractSteps(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    steps: Array<StepResult<any>>
  ): AgentStep[] {
    return steps.map((step, index) => ({
      stepNumber: index + 1,
      text: step.text || undefined,
      toolCalls: step.toolCalls?.map((call) => ({
        toolName: call.toolName,
        args: (call as { input?: Record<string, unknown> }).input || {},
        result: step.toolResults?.find(
          (r) => r.toolCallId === call.toolCallId
        )?.output,
      })),
    }));
  }

  /**
   * Extract executed trades from step results.
   */
  protected extractTradesFromSteps(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    steps: Array<StepResult<any>>
  ): Trade[] {
    const trades: Trade[] = [];

    for (const step of steps) {
      if (!step.toolCalls || !step.toolResults) continue;

      for (const call of step.toolCalls) {
        if (call.toolName === "placeOrder") {
          // Find corresponding result
          const resultPart = step.toolResults.find(
            (r) => r.toolCallId === call.toolCallId
          );
          const result = resultPart?.output as
            | { success: boolean; order?: { id: string; price?: number }; quantity?: number }
            | undefined;

          if (result?.success) {
            const input = (call as { input?: Record<string, unknown> }).input || {};
            const args = input as {
              market_ticker: string;
              side: PositionSide;
              action: TradeAction;
              quantity: number;
              limit_price?: number;
            };

            trades.push({
              id: result.order?.id || nanoid(),
              portfolioId: "",
              marketTicker: args.market_ticker,
              marketTitle: args.market_ticker, // Title will be enriched later
              side: args.side,
              action: args.action,
              quantity: args.quantity,
              price: result.order?.price || args.limit_price || 0,
              notional:
                args.quantity * (result.order?.price || args.limit_price || 0),
              createdAt: new Date(),
            });
          }
        }
      }
    }

    return trades;
  }

  /**
   * Save a chat message.
   * This replaces the old broadcast system.
   */
  protected async saveMessage(
    content: string,
    messageType: ChatMessageType,
    relatedTradeId?: string
  ): Promise<void> {
    const message: ChatMessage = {
      id: nanoid(),
      role: "assistant",
      parts: [{ type: "text", text: content }],
      metadata: {
        sessionId: this.config.sessionId,
        authorType: "model",
        authorId: this.config.modelId,
        messageType,
        relatedTradeId,
        createdAt: Date.now(),
      },
    };

    await saveChatMessage(message);
  }

  /**
   * Get the model ID for this agent
   */
  getModelId(): string {
    return this.config.modelId;
  }

  /**
   * Get the model identifier (e.g., "openrouter/gpt-4o")
   */
  getModelIdentifier(): string {
    return this.config.modelIdentifier;
  }
}

// ============================================================================
// AGENT FACTORY
// ============================================================================

/**
 * Create a prediction market agent for the given configuration.
 * @param config - Agent configuration
 */
export function createPredictionMarketAgent(
  config: PredictionMarketAgentConfig
): PredictionMarketAgent {
  return new PredictionMarketAgent(config);
}
