/**
 * Context builder for trading agent prompts
 */

import type { MarketContext, PriceSwing } from "@/types";

/**
 * Build a context prompt with market data and portfolio state
 */
export function buildContextPrompt(
  context: MarketContext,
  priceSwings?: PriceSwing[]
): string {
  const { availableMarkets, portfolio, recentTrades } = context;

  let prompt = `## Current Market Data\n\n`;

  if (priceSwings && priceSwings.length > 0) {
    prompt += `### Price Swings Detected\n\n`;
    prompt += `The following markets have significant price movements:\n`;
    prompt += priceSwings
      .map(
        (swing) =>
          `- ${swing.ticker}: ${(swing.changePercent * 100).toFixed(1)}% change (${swing.previousPrice.toFixed(2)} → ${swing.currentPrice.toFixed(2)})`
      )
      .join("\n");
    prompt += `\n\n`;
  }

  prompt += `### Available Markets\n\n`;
  prompt += JSON.stringify(
    availableMarkets.slice(0, 10).map((m) => ({
      ticker: m.ticker,
      title: m.title,
      yesPrice: m.yesPrice,
      noPrice: m.noPrice,
      volume: m.volume,
      status: m.status,
    })),
    null,
    2
  );

  prompt += `\n\n## Your Portfolio\n\n`;
  prompt += `Cash balance: $${portfolio.cashBalance.toFixed(2)}\n`;
  prompt += `Total value: $${portfolio.totalValue.toFixed(2)}\n\n`;

  prompt += `### Current Positions\n\n`;
  if (portfolio.positions.length > 0) {
    prompt += JSON.stringify(portfolio.positions, null, 2);
  } else {
    prompt += `No open positions`;
  }

  prompt += `\n\n## Recent Activity\n\n`;
  if (recentTrades.length > 0) {
    prompt += JSON.stringify(recentTrades.slice(0, 5), null, 2);
  } else {
    prompt += `No recent trades`;
  }

  prompt += `\n\n## Instructions\n\n`;
  prompt += `Analyze the markets above. Use your tools to gather more information if needed.\n`;
  prompt += `If you identify a trading opportunity with high conviction, execute a trade.\n`;
  prompt += `Explain your reasoning throughout the process.`;

  return prompt;
}
