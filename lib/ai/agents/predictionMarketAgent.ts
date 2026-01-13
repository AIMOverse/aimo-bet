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
import { type Wallet } from "ethers";
import { getModel } from "@/lib/ai/models";
import { TRADING_SYSTEM_PROMPT } from "@/lib/ai/prompts/systemPrompt";
import { createAgentSigners } from "@/lib/crypto/signers";

// Direct tool imports
import {
  discoverMarketsTool,
  explainMarketTool,
} from "@/lib/ai/tools/discover";
import { createPlaceMarketOrderTool } from "@/lib/ai/tools/trade/placeMarketOrder";
import { createPlaceLimitOrderTool } from "@/lib/ai/tools/trade/placeLimitOrder";
import { createCancelLimitOrderTool } from "@/lib/ai/tools/trade/cancelLimitOrder";

// Analysis tools (Parallel AI)
import { webSearchTool, deepResearchTool } from "@/lib/ai/tools/analysis";

// Management tools (multi-exchange)
import {
  createGetBalanceTool,
  createGetPositionsTool,
  createWithdrawToSolanaTool,
  type ToolSigners,
  type WithdrawSigners,
} from "@/lib/ai/tools/management";

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
    // Create unified signers for this agent (SVM + EVM)
    // Uses wallet registry to get per-model keys from env vars
    const agentSigners = await createAgentSigners(this.config.modelId);

    // Extract signers for tools
    const kalshiSigner: KeyPairSigner | undefined =
      agentSigners.svm?.keyPairSigner;
    const polymarketWallet: Wallet | undefined = agentSigners.evm?.wallet;

    // Log wallet availability
    console.log(`[PredictionMarketAgent:${this.config.modelId}] Signers:`, {
      hasSvm: !!agentSigners.svm,
      svmAddress: agentSigners.svm?.address,
      hasEvm: !!agentSigners.evm,
      evmAddress: agentSigners.evm?.address,
    });

    // Create signers for management tools (multi-chain)
    const signers: ToolSigners = {
      svm: { address: agentSigners.svm?.address || this.config.walletAddress },
      evm: { address: agentSigners.evm?.address || "" },
    };

    // Create withdrawal signers (needs full signer objects for Wormhole bridge)
    const withdrawSigners: WithdrawSigners = {
      svm: agentSigners.svm
        ? {
            address: agentSigners.svm.address,
            keyPairSigner: agentSigners.svm.keyPairSigner,
          }
        : undefined,
      evm: agentSigners.evm
        ? {
            address: agentSigners.evm.address,
            wallet: agentSigners.evm.wallet,
          }
        : undefined,
    };

    // Create tools directly with wallet context
    const tools = {
      getBalance: createGetBalanceTool(signers),
      getPositions: createGetPositionsTool(signers),
      discoverMarkets: discoverMarketsTool,
      explainMarket: explainMarketTool,
      placeMarketOrder: createPlaceMarketOrderTool(
        agentSigners.svm?.address || this.config.walletAddress,
        kalshiSigner,
        polymarketWallet,
      ),
      placeLimitOrder: createPlaceLimitOrderTool(polymarketWallet),
      cancelLimitOrder: createCancelLimitOrderTool(polymarketWallet),
      withdrawToSolana: createWithdrawToSolanaTool(withdrawSigners),
      webSearch: webSearchTool,
      deepResearch: deepResearchTool,
    };

    // Get the model instance with detailed error logging
    console.log(
      `[PredictionMarketAgent:${this.config.modelId}] Getting model instance...`,
    );

    let model;
    try {
      model = await getModel(this.config.modelId);
      console.log(
        `[PredictionMarketAgent:${this.config.modelId}] Model instance created successfully`,
      );
    } catch (modelError) {
      console.error(
        `[PredictionMarketAgent:${this.config.modelId}] Failed to get model:`,
        modelError,
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
      stopWhen: stepCountIs(Math.min(this.config.maxSteps ?? 15, 15)),
      maxOutputTokens: 1024,
    });

    // Build prompt based on context
    // When research context is present, include it in the prompt
    const prompt = this.buildPrompt();

    console.log(
      `[PredictionMarketAgent:${this.config.modelId}] Starting agent run`,
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
          requestBodyValues: JSON.stringify(error.requestBodyValues, null, 2),
          // stack: error.stack,
        },
      );
      throw agentError;
    }

    console.log(
      `[PredictionMarketAgent:${this.config.modelId}] Completed with ${result.steps.length} steps`,
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

    // Extract token usage from all steps
    const tokenUsage = this.extractTokenUsage(result.steps);

    return {
      reasoning,
      trades,
      decision,
      steps: result.steps.length,
      portfolioValue,
      marketTicker,
      marketTitle,
      tokenUsage,
    };
  }

  /**
   * Build the prompt based on context.
   * When research context is present, includes the research content.
   * Otherwise, uses a static prompt for KV cache optimization.
   */
  private buildPrompt(): string {
    const basePrompt =
      "Analyze prediction markets and execute trades if you find opportunities with >70% confidence.";

    const research = this.config.researchContext;
    if (!research) {
      return basePrompt;
    }

    // If research failed, just note it and continue
    if (research.status === "failed") {
      return `${basePrompt}\n\nNote: A background research task failed with error: ${
        research.error || "Unknown error"
      }. Please proceed with your analysis using other tools.`;
    }

    // Include successful research content
    if (research.content) {
      return `${basePrompt}\n\n## Research Report (run_id: ${research.run_id})\n\nThe following research was completed for you:\n\n${research.content}\n\n---\n\nPlease review this research and use it to inform your trading decisions.`;
    }

    return basePrompt;
  }

  /**
   * Extract reasoning from agent result.
   * Uses result.text if available, otherwise collects text from individual steps.
   */
  private extractReasoning(
    finalText: string | undefined,
    steps: Array<{ text?: string }>,
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
   * Looks for successful placeOrder tool calls and their results.
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
        // Handle placeMarketOrder and placeLimitOrder tools
        if (
          call.toolName === "placeMarketOrder" ||
          call.toolName === "placeLimitOrder"
        ) {
          const resultEntry = step.toolResults.find(
            (r) => r.toolCallId === call.toolCallId,
          );

          const typedOutput = resultEntry?.output as
            | {
                success?: boolean;
                order_id?: string;
                exchange?: string;
                status?: string;
                filled_quantity?: number;
                avg_price?: number;
                total_cost?: number;
              }
            | undefined;

          if (typedOutput?.success) {
            const input = call.input as {
              exchange: "kalshi" | "polymarket";
              id: string;
              side: "buy" | "sell";
              outcome: "yes" | "no";
              order_type: "market" | "limit";
              quantity: number;
              price?: number;
            };

            trades.push({
              id: typedOutput.order_id || nanoid(),
              marketTicker: input.id,
              marketTitle: input.id,
              side: input.outcome as PositionSide,
              action: input.side as TradeAction,
              quantity: typedOutput.filled_quantity || input.quantity || 0,
              price: typedOutput.avg_price || input.price || 0,
              notional: typedOutput.total_cost || 0,
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
    }>,
  ): number {
    for (const step of steps) {
      if (!step.toolCalls || !step.toolResults) continue;

      for (const call of step.toolCalls) {
        if (call.toolName === "getBalance") {
          const resultEntry = step.toolResults.find(
            (r) => r.toolCallId === call.toolCallId,
          );

          const typedOutput = resultEntry?.output as
            | { success?: boolean; total_balance?: number }
            | undefined;

          if (
            typedOutput?.success &&
            typeof typedOutput.total_balance === "number"
          ) {
            return typedOutput.total_balance;
          }
        }
      }
    }

    return 0;
  }

  /**
   * Extract total token usage from all agent steps.
   * Sums up inputTokens and outputTokens from each step's usage.
   */
  private extractTokenUsage(
    steps: Array<{
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
      };
    }>,
  ): { totalTokens: number } {
    let totalTokens = 0;

    for (const step of steps) {
      if (step.usage) {
        totalTokens +=
          (step.usage.inputTokens ?? 0) + (step.usage.outputTokens ?? 0);
      }
    }

    return { totalTokens };
  }
}
