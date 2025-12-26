"use workflow";

import { generateText } from "ai";
import { getModel } from "@/lib/ai/models";

// ============================================================================
// Types
// ============================================================================

interface DailyReviewInput {
  sessionId: string;
  date: string; // YYYY-MM-DD
}

interface DailyReviewResult {
  totalPnL: number;
  tradesAnalyzed: number;
  lessonsLearned: string[];
  calibrationScore: number;
}

interface TradeRecord {
  id: string;
  ticker: string;
  side: string;
  action: string;
  quantity: number;
  price: number;
  realized_pnl?: number;
  createdAt: string;
}

interface SettlementRecord {
  id: string;
  ticker: string;
  outcome: string;
  settledAt: string;
}

// ============================================================================
// Configuration
// ============================================================================

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const ANALYSIS_MODEL = "openrouter/gpt-4o-mini";

// ============================================================================
// Daily Review Workflow
// ============================================================================

/**
 * Analyzes daily trading performance and extracts insights.
 * Triggered by cron at end of each trading day.
 */
export async function dailyReviewWorkflow(
  input: DailyReviewInput
): Promise<DailyReviewResult> {
  console.log(
    `[dailyReview] Starting daily review for ${input.date}, session ${input.sessionId}`
  );

  // Step 1: Fetch today's trades
  const trades = await fetchTrades(input.date);

  // Step 2: Fetch settlements
  const settlements = await fetchSettlements(input.date);

  // Step 3: Calculate P&L
  const pnl = calculatePnL(trades);

  // Step 4: Analyze with LLM
  const analysis = await analyzeTrades(trades, settlements, pnl);

  // Step 5: Save review
  await saveReview(input, pnl, trades.length, analysis);

  console.log(
    `[dailyReview] Completed review: PnL=$${pnl.toFixed(2)}, ${trades.length} trades analyzed`
  );

  return {
    totalPnL: pnl,
    tradesAnalyzed: trades.length,
    lessonsLearned: analysis.lessons,
    calibrationScore: analysis.calibrationScore,
  };
}

// ============================================================================
// Step Functions
// ============================================================================

async function fetchTrades(date: string): Promise<TradeRecord[]> {
  "use step";

  try {
    const response = await fetch(`${BASE_URL}/api/trades?date=${date}`);

    if (!response.ok) {
      console.error(`[dailyReview] Failed to fetch trades: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("[dailyReview] Error fetching trades:", error);
    return [];
  }
}

async function fetchSettlements(date: string): Promise<SettlementRecord[]> {
  "use step";

  try {
    const response = await fetch(`${BASE_URL}/api/settlements?date=${date}`);

    if (!response.ok) {
      console.error(
        `[dailyReview] Failed to fetch settlements: ${response.status}`
      );
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("[dailyReview] Error fetching settlements:", error);
    return [];
  }
}

function calculatePnL(trades: TradeRecord[]): number {
  return trades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
}

async function analyzeTrades(
  trades: TradeRecord[],
  settlements: SettlementRecord[],
  pnl: number
): Promise<{ lessons: string[]; calibrationScore: number }> {
  "use step";

  // If no trades, return default values
  if (trades.length === 0) {
    return {
      lessons: ["No trades to analyze today."],
      calibrationScore: 0.5,
    };
  }

  try {
    const model = getModel(ANALYSIS_MODEL);

    const { text } = await generateText({
      model,
      system: `You are analyzing trading performance for a prediction market agent.
Your goal is to extract key lessons and calibration insights from the trading activity.

Return a valid JSON object with this exact structure:
{
  "lessons": ["lesson 1", "lesson 2", ...],
  "calibrationScore": 0.XX
}

The calibrationScore should be between 0 and 1, where:
- 1.0 = Perfect calibration (predicted probabilities match actual outcomes)
- 0.5 = Random/no skill
- 0.0 = Inverse calibration (consistently wrong)

Focus on:
1. What types of markets performed well or poorly
2. Whether position sizing was appropriate
3. Timing of entries and exits
4. Pattern recognition opportunities`,
      prompt: `Analyze this trading day:

Trades executed:
${JSON.stringify(trades, null, 2)}

Market settlements:
${JSON.stringify(settlements, null, 2)}

Total P&L: $${pnl.toFixed(2)}

Provide lessons learned and a calibration score.`,
    });

    // Parse the response
    try {
      const parsed = JSON.parse(text);
      return {
        lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
        calibrationScore:
          typeof parsed.calibrationScore === "number"
            ? Math.max(0, Math.min(1, parsed.calibrationScore))
            : 0.5,
      };
    } catch {
      // If parsing fails, extract what we can
      return {
        lessons: [text.slice(0, 500)],
        calibrationScore: 0.5,
      };
    }
  } catch (error) {
    console.error("[dailyReview] Error analyzing trades:", error);
    return {
      lessons: ["Analysis failed due to an error."],
      calibrationScore: 0.5,
    };
  }
}

async function saveReview(
  input: DailyReviewInput,
  pnl: number,
  tradesCount: number,
  analysis: { lessons: string[]; calibrationScore: number }
): Promise<void> {
  "use step";

  try {
    await fetch(`${BASE_URL}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: input.sessionId,
        date: input.date,
        pnl,
        tradesCount,
        lessons: analysis.lessons,
        calibrationScore: analysis.calibrationScore,
      }),
    });
  } catch (error) {
    console.error("[dailyReview] Failed to save review:", error);
    // Don't throw - saving is optional
  }
}
