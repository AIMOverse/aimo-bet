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

## Instructions

1. Use \`discoverEvent\` to get current details for market "${signal.ticker}"
2. Use \`retrievePosition\` to check if you have existing positions
3. Analyze whether this ${signalType.toLowerCase()} presents a trading opportunity
4. If confident (>70%), execute a trade using \`increasePosition\` or \`decreasePosition\`
5. Explain your reasoning clearly`;
}

function buildPeriodicPrompt(usdcBalance: number): string {
  return `## Periodic Market Scan

## Your Resources

Available USDC: $${usdcBalance.toFixed(2)}

## Instructions

1. Use \`discoverEvent\` to browse active prediction markets
2. Use \`retrievePosition\` to review your current positions
3. Look for mispriced markets or opportunities based on your analysis
4. If you find a high-conviction opportunity (>70%), execute a trade
5. If no compelling opportunities, explain why you're holding`;
}
