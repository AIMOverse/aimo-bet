/**
 * Lean prompt builder for trading agent
 *
 * Replaces contextBuilder.ts with a simpler approach:
 * - Only signal + balance context passed in prompt
 * - Agent discovers market details via tools (fresher data)
 */

export interface TradingPromptInput {
  signal?: {
    type: "price_swing" | "volume_spike" | "orderbook_imbalance";
    ticker: string;
    data: Record<string, unknown>;
    timestamp: number;
  };
  usdcBalance: number;
}

export function buildTradingPrompt(input: TradingPromptInput): string {
  const { signal, usdcBalance } = input;

  if (signal) {
    return buildSignalPrompt(signal, usdcBalance);
  }
  return buildPeriodicPrompt(usdcBalance);
}

function buildSignalPrompt(
  signal: NonNullable<TradingPromptInput["signal"]>,
  usdcBalance: number,
): string {
  const signalType = signal.type.replace(/_/g, " ").toUpperCase();

  let signalDetails = "";
  switch (signal.type) {
    case "price_swing": {
      const { previousPrice, currentPrice, changePercent } = signal.data as {
        previousPrice: number;
        currentPrice: number;
        changePercent: number;
      };
      signalDetails = `
- Previous price: ${previousPrice.toFixed(4)}
- Current price: ${currentPrice.toFixed(4)}
- Change: ${(changePercent * 100).toFixed(2)}%`;
      break;
    }

    case "volume_spike": {
      const { volume, averageVolume, multiplier, takerSide } = signal.data as {
        volume: number;
        averageVolume: number;
        multiplier: number;
        takerSide: string;
      };
      signalDetails = `
- Trade volume: ${volume}
- Average volume: ${averageVolume.toFixed(0)}
- Spike: ${multiplier.toFixed(1)}x normal
- Taker side: ${takerSide}`;
      break;
    }

    case "orderbook_imbalance": {
      const { ratio, direction } = signal.data as {
        ratio: number;
        direction: string;
      };
      signalDetails = `
- Imbalance ratio: ${ratio.toFixed(2)}
- Direction: ${direction}`;
      break;
    }
  }

  return `## Trading Signal Detected

**Type:** ${signalType}
**Market:** ${signal.ticker}
**Time:** ${new Date(signal.timestamp).toISOString()}
${signalDetails}

## Your Resources

Available USDC: $${usdcBalance.toFixed(2)}
**Max trade size: $10 USDC per trade**

## Instructions

1. Use \`discoverEvent\` to get current details for market "${signal.ticker}"
2. Use \`retrievePosition\` to check if you have existing positions
3. Analyze whether this ${signalType.toLowerCase()} presents a trading opportunity
4. If confident (>70%), execute a trade using \`increasePosition\` or \`decreasePosition\` (max $10 USDC)
5. Explain your reasoning clearly`;
}

function buildPeriodicPrompt(usdcBalance: number): string {
  return `## Periodic Market Scan

## Your Resources

Available USDC: $${usdcBalance.toFixed(2)}
**Max trade size: $10 USDC per trade**

## Instructions

1. Use \`discoverEvent\` to browse active prediction markets
2. Use \`retrievePosition\` to review your current positions
3. Look for mispriced markets or opportunities based on your analysis
4. If you find a high-conviction opportunity (>70%), execute a trade (max $10 USDC)
5. If no compelling opportunities, explain why you're holding`;
}

/**
 * Test prompt that forces the agent to execute a small trade (1-5 USDC)
 * Use this for testing the trading pipeline end-to-end
 */
export function buildTestPrompt(usdcBalance: number): string {
  return `## TEST MODE - Execute Trade

**This is a test run. You MUST execute a trade.**

## Your Resources

Available USDC: $${usdcBalance.toFixed(2)}

## Instructions

1. Use \`discoverEvent\` with category "crypto" to find active prediction markets
2. Pick a market with a ticker starting with "KX" (e.g., KXBTC, KXETH, KXSOL)
3. **Execute a trade between $1 and $5 USDC** - this is mandatory for testing
4. Use \`increasePosition\` to buy either YES or NO tokens
5. Report the trade details

## Important

- This is a TEST - do not skip trading
- Trade size: between $1 and $5 USDC (pick any amount in this range)
- Pick any side (YES or NO) - the goal is to verify the trading pipeline works
- **If a trade fails with "market not found", try a DIFFERENT market** - some markets in the listing may not be tradeable yet
- Keep trying different markets until one succeeds (try at least 3 markets before giving up)
- Prefer crypto markets (BTC, ETH, SOL) as they tend to be more reliable`;
}
