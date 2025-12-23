import type {
  PerformanceSnapshot,
  ChartDataPoint,
  ArenaModel,
  LeaderboardEntry,
  PortfolioState,
} from '@/types/arena';
import { DEFAULT_ARENA_MODELS, DEFAULT_STARTING_CAPITAL } from '../constants';

// Generate a random UUID-like string
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Random walk generator for realistic performance simulation
function randomWalk(
  startValue: number,
  steps: number,
  volatility: number = 0.02,
  drift: number = 0.0001
): number[] {
  const values: number[] = [startValue];

  for (let i = 1; i < steps; i++) {
    const change = (Math.random() - 0.5) * 2 * volatility + drift;
    const newValue = values[i - 1] * (1 + change);
    values.push(Math.max(newValue, startValue * 0.5)); // Floor at 50% of start
  }

  return values;
}

// Generate performance snapshots for all models
export function generateMockPerformanceSnapshots(
  sessionId: string,
  hoursBack: number = 24,
  intervalMinutes: number = 30
): PerformanceSnapshot[] {
  const snapshots: PerformanceSnapshot[] = [];
  const now = Date.now();
  const startTime = now - hoursBack * 60 * 60 * 1000;
  const numPoints = Math.floor((hoursBack * 60) / intervalMinutes);

  // Generate different volatility and drift for each model to create variety
  const modelConfigs = DEFAULT_ARENA_MODELS.map((_, index) => ({
    volatility: 0.01 + Math.random() * 0.03,
    drift: (Math.random() - 0.4) * 0.001, // Slight positive bias
  }));

  DEFAULT_ARENA_MODELS.forEach((modelData, modelIndex) => {
    const modelId = generateId();
    const config = modelConfigs[modelIndex];
    const values = randomWalk(
      DEFAULT_STARTING_CAPITAL,
      numPoints,
      config.volatility,
      config.drift
    );

    values.forEach((value, pointIndex) => {
      const timestamp = new Date(startTime + pointIndex * intervalMinutes * 60 * 1000);
      snapshots.push({
        id: generateId(),
        sessionId,
        modelId,
        accountValue: Math.round(value * 100) / 100,
        timestamp,
      });
    });
  });

  return snapshots;
}

// Convert snapshots to chart data format
export function snapshotsToChartData(
  snapshots: PerformanceSnapshot[],
  models: ArenaModel[]
): ChartDataPoint[] {
  const dataByTime = new Map<string, ChartDataPoint>();

  // Create a model ID to name mapping
  const modelNames = new Map<string, string>();
  models.forEach(m => modelNames.set(m.id, m.name));

  snapshots.forEach(snapshot => {
    const timeKey = snapshot.timestamp.toISOString();

    if (!dataByTime.has(timeKey)) {
      dataByTime.set(timeKey, { timestamp: timeKey });
    }

    const point = dataByTime.get(timeKey)!;
    const modelName = modelNames.get(snapshot.modelId) || snapshot.modelId;
    point[modelName] = snapshot.accountValue;
  });

  return Array.from(dataByTime.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

// Generate mock chart data directly (for simpler usage)
export function generateMockChartData(
  hoursBack: number = 24,
  intervalMinutes: number = 30
): ChartDataPoint[] {
  const data: ChartDataPoint[] = [];
  const now = Date.now();
  const startTime = now - hoursBack * 60 * 60 * 1000;
  const numPoints = Math.floor((hoursBack * 60) / intervalMinutes);

  // Generate random walks for each model
  const modelValues = DEFAULT_ARENA_MODELS.map(() => {
    const volatility = 0.01 + Math.random() * 0.03;
    const drift = (Math.random() - 0.4) * 0.001;
    return randomWalk(DEFAULT_STARTING_CAPITAL, numPoints, volatility, drift);
  });

  for (let i = 0; i < numPoints; i++) {
    const timestamp = new Date(startTime + i * intervalMinutes * 60 * 1000);
    const point: ChartDataPoint = {
      timestamp: timestamp.toISOString(),
    };

    DEFAULT_ARENA_MODELS.forEach((model, modelIndex) => {
      point[model.name] = Math.round(modelValues[modelIndex][i] * 100) / 100;
    });

    data.push(point);
  }

  return data;
}

// Generate mock leaderboard data
export function generateMockLeaderboard(): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  DEFAULT_ARENA_MODELS.forEach(modelData => {
    const model: ArenaModel = {
      ...modelData,
      id: generateId(),
      createdAt: new Date(),
    };

    // Generate random performance
    const returnPercent = (Math.random() - 0.3) * 40; // -10% to +30%
    const totalValue = DEFAULT_STARTING_CAPITAL * (1 + returnPercent / 100);
    const cashBalance = totalValue * (0.2 + Math.random() * 0.3); // 20-50% in cash

    const portfolio: PortfolioState = {
      id: generateId(),
      sessionId: generateId(),
      modelId: model.id,
      cashBalance: Math.round(cashBalance * 100) / 100,
      createdAt: new Date(),
      positions: [],
      totalValue: Math.round(totalValue * 100) / 100,
      unrealizedPnl: Math.round((totalValue - DEFAULT_STARTING_CAPITAL) * 100) / 100,
    };

    entries.push({
      model,
      portfolio,
      rank: 0, // Will be set after sorting
      change: Math.floor(Math.random() * 5) - 2, // -2 to +2 rank change
      returnPercent: Math.round(returnPercent * 100) / 100,
    });
  });

  // Sort by return and assign ranks
  entries.sort((a, b) => b.returnPercent - a.returnPercent);
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  return entries;
}

// Get latest values for each model (for legend display)
export function getLatestModelValues(
  chartData: ChartDataPoint[]
): Map<string, number> {
  const latestValues = new Map<string, number>();

  if (chartData.length === 0) return latestValues;

  const latestPoint = chartData[chartData.length - 1];

  Object.entries(latestPoint).forEach(([key, value]) => {
    if (key !== 'timestamp' && typeof value === 'number') {
      latestValues.set(key, value);
    }
  });

  return latestValues;
}
