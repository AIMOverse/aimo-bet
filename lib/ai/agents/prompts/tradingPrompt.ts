/**
 * Trading System Prompt for Autonomous LLM Trading Agents
 */

export const TRADING_SYSTEM_PROMPT = `You are an autonomous prediction market trader competing in Alpha Arena.

## Your Tools

**Research:**
- getMarkets: List available prediction markets
- getMarketDetails: Get details for a specific market
- getLiveData: Get current prices and orderbook depth

**Portfolio:**
- getBalance: Check your wallet balance (USDC)
- getPositions: See your current open positions
- getTradeHistory: Review your past trades

**Trading:**
- placeOrder: Execute a buy or sell order
- getOrderStatus: Check if an order filled
- cancelOrder: Cancel a pending order

## Trading Guidelines

1. **Research First**: Always check market details and your portfolio before trading
2. **High Conviction Only**: Only trade when confidence > 70%
3. **Risk Management**:
   - Never risk more than 20% of portfolio on a single position
   - Consider your existing positions before adding more
4. **Explain Reasoning**: Document your analysis and decision process

## Workflow

1. Review the market data provided
2. Use tools to gather additional information if needed
3. Analyze opportunities based on your predictions
4. If high-conviction opportunity exists, execute trade
5. Summarize your reasoning and actions

Remember: You are competing against other AI models. Make smart, calculated decisions.`;

/**
 * Build a context prompt with market data and portfolio state
 */
export function buildContextPrompt(context: {
  availableMarkets: Array<{
    ticker: string;
    title: string;
    yesPrice: number;
    noPrice: number;
    volume: number;
    status: string;
  }>;
  portfolio: {
    cashBalance: number;
    totalValue: number;
    positions: Array<{
      marketTicker: string;
      marketTitle: string;
      side: string;
      quantity: number;
    }>;
  };
  recentTrades: Array<{
    marketTicker: string;
    side: string;
    action: string;
    quantity: number;
    price: number;
  }>;
  priceSwings?: Array<{
    ticker: string;
    previousPrice: number;
    currentPrice: number;
    changePercent: number;
  }>;
}): string {
  const { availableMarkets, portfolio, recentTrades, priceSwings } = context;

  let prompt = `## Current Market Data\n\n`;

  if (priceSwings && priceSwings.length > 0) {
    prompt += `**Significant Price Movements Detected:**\n`;
    prompt += priceSwings
      .map(
        (swing) =>
          `- ${swing.ticker}: ${(swing.changePercent * 100).toFixed(1)}% change (${swing.previousPrice.toFixed(2)} → ${swing.currentPrice.toFixed(2)})`
      )
      .join("\n");
    prompt += `\n\n`;
  }

  prompt += `Available markets:\n`;
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

  if (portfolio.positions.length > 0) {
    prompt += `Current positions:\n`;
    prompt += JSON.stringify(portfolio.positions, null, 2);
  } else {
    prompt += `No open positions`;
  }

  prompt += `\n\n## Recent Activity\n\n`;

  if (recentTrades.length > 0) {
    prompt += `Recent trades:\n`;
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
