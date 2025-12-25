import { generateText } from "ai";
import { getModel } from "@/lib/ai/models";
import { nanoid } from "nanoid";
import type {
  PredictionMarketAgentConfig,
  MarketContext,
  MarketAnalysis,
  TradingDecision,
  Trade,
  PredictionMarket,
} from "@/types/db";
import type { ChatMessage, ChatMessageType } from "@/types/chat";
import { saveChatMessage } from "@/lib/supabase/db";

// Import dflow trading tools
import {
  getMarketsTool,
  getMarketDetailsTool,
  getMarketPricesTool,
} from "@/lib/ai/tools/market-discovery";
import {
  placeOrderTool,
  getOrderStatusTool,
  cancelOrderTool,
} from "@/lib/ai/tools/trade-execution";
import {
  getPositionsTool,
  getBalanceTool,
  getTradeHistoryTool,
} from "@/lib/ai/tools/portfolio-management";

// ============================================================================
// DFLOW TOOLS - Available for agent use with AI SDK tool-calling
// ============================================================================

/**
 * Collection of dflow trading tools that can be used by agents via AI SDK.
 * These tools are designed to be passed to generateText/streamText with tools option.
 */
export const dflowTools = {
  getMarkets: getMarketsTool,
  getMarketDetails: getMarketDetailsTool,
  getMarketPrices: getMarketPricesTool,
  placeOrder: placeOrderTool,
  getOrderStatus: getOrderStatusTool,
  cancelOrder: cancelOrderTool,
  getPositions: getPositionsTool,
  getBalance: getBalanceTool,
  getTradeHistory: getTradeHistoryTool,
};

// ============================================================================
// ABSTRACT BASE CLASS
// ============================================================================

/**
 * Abstract base class for prediction market trading agents.
 * Extend this class to create custom trading strategies.
 */
export abstract class PredictionMarketAgent {
  protected config: PredictionMarketAgentConfig;

  constructor(config: PredictionMarketAgentConfig) {
    this.config = config;
  }

  /**
   * Analyze available markets and return analysis for each.
   * Override this method to implement custom market analysis.
   */
  abstract analyzeMarkets(context: MarketContext): Promise<MarketAnalysis[]>;

  /**
   * Make a trading decision based on market analysis.
   * Override this method to implement custom decision logic.
   */
  abstract makeDecision(
    context: MarketContext,
    analyses: MarketAnalysis[],
  ): Promise<TradingDecision>;

  /**
   * Generate a broadcast message explaining the decision.
   * Override this method to customize broadcast content.
   */
  abstract generateBroadcast(
    decision: TradingDecision,
    context: MarketContext,
  ): Promise<string>;

  /**
   * Main execution loop for the trading agent.
   * Analyzes markets, makes decisions, and generates chat messages.
   */
  async executeTradingLoop(context: MarketContext): Promise<{
    decision: TradingDecision;
    broadcast: string;
    analyses: MarketAnalysis[];
  }> {
    // Step 1: Analyze markets
    const analyses = await this.analyzeMarkets(context);

    // Step 2: Make trading decision
    const decision = await this.makeDecision(context, analyses);

    // Step 3: Generate broadcast message
    const broadcast = await this.generateBroadcast(decision, context);

    // Step 4: Save to chat (replaces old broadcast system)
    const messageType = decision.action === "hold" ? "commentary" : "trade";
    await this.saveMessage(broadcast, messageType);

    return { decision, broadcast, analyses };
  }

  /**
   * Get the model ID for this agent
   */
  getModelId(): string {
    return this.config.modelId;
  }

  /**
   * Get the model identifier (e.g., "openai/gpt-4o")
   */
  getModelIdentifier(): string {
    return this.config.modelIdentifier;
  }

  /**
   * Save a chat message.
   * This replaces the old broadcast system.
   */
  async saveMessage(
    content: string,
    messageType: ChatMessageType,
    relatedTradeId?: string,
  ): Promise<void> {
    const message: ChatMessage = {
      id: nanoid(),
      role: "assistant", // Models use assistant role
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
}

// ============================================================================
// DEFAULT IMPLEMENTATION
// ============================================================================

/**
 * Default prediction market agent implementation using LLM for analysis.
 * Uses the configured model to analyze markets and make trading decisions.
 */
export class DefaultPredictionMarketAgent extends PredictionMarketAgent {
  private maxAnalysisMarkets = 5;
  private maxPositionSize = 100;
  private minConfidence = 0.6;

  async analyzeMarkets(context: MarketContext): Promise<MarketAnalysis[]> {
    const { availableMarkets, portfolio, recentTrades } = context;

    // Select markets to analyze (prioritize by volume and opportunity)
    const marketsToAnalyze = this.selectMarketsToAnalyze(
      availableMarkets,
      this.maxAnalysisMarkets,
    );

    const analyses: MarketAnalysis[] = [];

    for (const market of marketsToAnalyze) {
      try {
        const analysis = await this.analyzeMarket(
          market,
          portfolio.cashBalance,
          recentTrades,
        );
        analyses.push(analysis);
      } catch (error) {
        console.error(`Failed to analyze market ${market.ticker}:`, error);
      }
    }

    return analyses;
  }

  async makeDecision(
    context: MarketContext,
    analyses: MarketAnalysis[],
  ): Promise<TradingDecision> {
    const { portfolio } = context;

    // Filter to high-confidence analyses
    const highConfidence = analyses.filter(
      (a) => a.confidence >= this.minConfidence,
    );

    if (highConfidence.length === 0) {
      return {
        action: "hold",
        reasoning: "No markets with sufficient confidence level for trading.",
        confidence: 0.5,
      };
    }

    // Select the best opportunity
    const bestOpportunity = highConfidence.reduce((best, current) =>
      current.confidence > best.confidence ? current : best,
    );

    // Check if we have enough capital
    if (!bestOpportunity.suggestedPosition) {
      return {
        action: "hold",
        reasoning: `Analysis complete for ${bestOpportunity.marketTicker}, but no actionable position suggested.`,
        confidence: bestOpportunity.confidence,
      };
    }

    const { side, quantity, maxPrice } = bestOpportunity.suggestedPosition;
    const estimatedCost = quantity * maxPrice;

    if (estimatedCost > portfolio.cashBalance * 0.3) {
      // Don't risk more than 30% on a single trade
      return {
        action: "hold",
        reasoning:
          "Position size exceeds risk limits. Waiting for better opportunity.",
        confidence: bestOpportunity.confidence,
      };
    }

    return {
      action: "buy",
      marketTicker: bestOpportunity.marketTicker,
      side,
      quantity,
      limitPrice: maxPrice,
      reasoning: bestOpportunity.reasoning,
      confidence: bestOpportunity.confidence,
    };
  }

  async generateBroadcast(
    decision: TradingDecision,
    context: MarketContext,
  ): Promise<string> {
    const { action, marketTicker, side, quantity, reasoning, confidence } =
      decision;

    if (action === "hold") {
      return reasoning;
    }

    const market = context.availableMarkets.find(
      (m) => m.ticker === marketTicker,
    );
    const marketTitle = market?.title || marketTicker;

    return (
      `${action.toUpperCase()} ${quantity} ${side?.toUpperCase()} on "${marketTitle}". ` +
      `Confidence: ${(confidence * 100).toFixed(0)}%. ` +
      `Reasoning: ${reasoning}`
    );
  }

  /**
   * Analyze a single market using LLM
   */
  private async analyzeMarket(
    market: PredictionMarket,
    cashBalance: number,
    _recentTrades: Trade[],
  ): Promise<MarketAnalysis> {
    const model = getModel(this.config.modelIdentifier);

    const prompt = `You are a prediction market analyst. Analyze the following market:

Market: ${market.title}
Ticker: ${market.ticker}
Category: ${market.category}
Current YES price: $${market.yesPrice.toFixed(2)} (${(market.yesPrice * 100).toFixed(0)}%)
Current NO price: $${market.noPrice.toFixed(2)} (${(market.noPrice * 100).toFixed(0)}%)
Volume: $${market.volume.toLocaleString()}
Expiration: ${market.expirationDate.toISOString().split("T")[0]}

Your available capital: $${cashBalance.toFixed(2)}

Provide your analysis in the following JSON format:
{
  "predictedOutcome": "yes" or "no",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "shouldTrade": true/false,
  "suggestedSide": "yes" or "no" (if shouldTrade is true),
  "suggestedQuantity": number (if shouldTrade is true),
  "maxPrice": number (if shouldTrade is true)
}

Only suggest trading if you have strong conviction. Be conservative with position sizes.`;

    try {
      const { text } = await generateText({
        model,
        prompt,
        maxOutputTokens: 500,
      });

      // Parse the JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        marketTicker: market.ticker,
        marketTitle: market.title,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        predictedOutcome: parsed.predictedOutcome === "yes" ? "yes" : "no",
        reasoning: parsed.reasoning || "Analysis complete.",
        suggestedPosition: parsed.shouldTrade
          ? {
              side: parsed.suggestedSide === "yes" ? "yes" : "no",
              quantity: Math.min(
                parsed.suggestedQuantity || 10,
                this.maxPositionSize,
              ),
              maxPrice:
                parsed.maxPrice ||
                (parsed.suggestedSide === "yes"
                  ? market.yesPrice
                  : market.noPrice),
            }
          : undefined,
      };
    } catch (error) {
      console.error("Failed to analyze market with LLM:", error);

      // Return a neutral analysis on error
      return {
        marketTicker: market.ticker,
        marketTitle: market.title,
        confidence: 0.5,
        predictedOutcome: "yes",
        reasoning: "Unable to complete analysis. Defaulting to neutral stance.",
      };
    }
  }

  /**
   * Select markets to analyze based on opportunity
   */
  private selectMarketsToAnalyze(
    markets: PredictionMarket[],
    count: number,
  ): PredictionMarket[] {
    // Score markets by opportunity (volatile prices near 50% = more opportunity)
    const scored = markets
      .filter((m) => m.status === "open")
      .map((market) => {
        const priceDistance = Math.abs(market.yesPrice - 0.5);
        const volatilityScore = 1 - priceDistance; // Higher score for prices near 50%
        const volumeScore = Math.log10(market.volume + 1) / 7; // Normalize volume
        return {
          market,
          score: volatilityScore * 0.6 + volumeScore * 0.4,
        };
      })
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, count).map((s) => s.market);
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
  config: PredictionMarketAgentConfig,
): PredictionMarketAgent {
  return new DefaultPredictionMarketAgent(config);
}
