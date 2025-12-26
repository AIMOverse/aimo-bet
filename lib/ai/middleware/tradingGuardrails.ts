/**
 * Trading Guardrails Middleware
 *
 * AI SDK middleware that enforces LLM-level limits for trading agents.
 * Observability is handled by workflow dashboard, not this middleware.
 */

import type { LanguageModelMiddleware } from "ai";

/**
 * Configuration for trading middleware
 */
export interface TradingMiddlewareConfig {
  /** Maximum tokens per LLM call */
  maxTokens: number;
  /** Maximum tool calls per agent run (prevent runaway agents) */
  maxToolCalls: number;
  /** Maximum trades per execution */
  maxTradesPerRun: number;
  /** Model ID for observability tagging */
  modelId: string;
}

/**
 * Default configuration for trading middleware
 */
export const DEFAULT_TRADING_MIDDLEWARE_CONFIG: TradingMiddlewareConfig = {
  maxTokens: 4096,
  maxToolCalls: 20,
  maxTradesPerRun: 3,
  modelId: "unknown",
};

/**
 * Creates middleware that enforces LLM-level limits for trading agents.
 *
 * @param config - Configuration for the middleware
 * @returns LanguageModelMiddleware instance
 */
export function createTradingMiddleware(
  config: Partial<TradingMiddlewareConfig> = {}
): LanguageModelMiddleware {
  const mergedConfig: TradingMiddlewareConfig = {
    ...DEFAULT_TRADING_MIDDLEWARE_CONFIG,
    ...config,
  };

  let toolCallCount = 0;
  let tradeCount = 0;

  return {
    specificationVersion: "v3",

    transformParams: async ({ params }) => {
      // Enforce maxTokens at request level
      return {
        ...params,
        maxTokens: Math.min(
          params.maxTokens ?? mergedConfig.maxTokens,
          mergedConfig.maxTokens
        ),
      };
    },

    wrapGenerate: async ({ doGenerate }) => {
      const start = Date.now();

      // Pre-check: have we exceeded tool call limit?
      if (toolCallCount >= mergedConfig.maxToolCalls) {
        throw new Error(
          `[${mergedConfig.modelId}] Tool call limit exceeded (${mergedConfig.maxToolCalls})`
        );
      }

      console.log(
        `[${mergedConfig.modelId}] Generate started (tools: ${toolCallCount}/${mergedConfig.maxToolCalls}, trades: ${tradeCount}/${mergedConfig.maxTradesPerRun})`
      );

      const result = await doGenerate();

      const duration = Date.now() - start;

      // Count tool calls and trades
      if (result.toolCalls) {
        toolCallCount += result.toolCalls.length;
        tradeCount += result.toolCalls.filter(
          (c) => c.toolName === "placeOrder"
        ).length;

        if (tradeCount > mergedConfig.maxTradesPerRun) {
          throw new Error(
            `[${mergedConfig.modelId}] Trade limit exceeded (${mergedConfig.maxTradesPerRun})`
          );
        }
      }

      console.log(
        `[${mergedConfig.modelId}] Generate completed | duration: ${duration}ms | tools: ${toolCallCount} | trades: ${tradeCount}`
      );

      return result;
    },

    wrapStream: async ({ doStream }) => {
      const start = Date.now();

      console.log(`[${mergedConfig.modelId}] Stream started`);

      const { stream, ...rest } = await doStream();

      // Create a pass-through transform that logs on completion
      const transformStream = new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk);
        },
        flush() {
          const duration = Date.now() - start;
          console.log(
            `[${mergedConfig.modelId}] Stream completed | duration: ${duration}ms`
          );
        },
      });

      return {
        stream: stream.pipeThrough(transformStream),
        ...rest,
      };
    },
  };
}

/**
 * Create a factory function that produces fresh middleware instances.
 * Use this when you need to reset counters between agent runs.
 */
export function createTradingMiddlewareFactory(
  baseConfig: Partial<TradingMiddlewareConfig> = {}
) {
  return (
    overrides: Partial<TradingMiddlewareConfig> = {}
  ): LanguageModelMiddleware => {
    return createTradingMiddleware({ ...baseConfig, ...overrides });
  };
}
