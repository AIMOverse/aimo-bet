import type {
  Trade,
  TradeWithModel,
  Position,
  Broadcast,
  BroadcastWithModel,
  ArenaModel,
  PositionSide,
  TradeAction,
  BroadcastType,
} from '@/types/arena';
import { MOCK_MARKETS } from './markets';
import { DEFAULT_ARENA_MODELS } from '../constants';

// Generate a random UUID-like string
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Sample reasoning texts for trades
const TRADE_REASONING = [
  'Strong momentum indicators suggest this market is undervalued. Technical analysis shows bullish divergence.',
  'Recent news events increase probability of this outcome. Adjusting position accordingly.',
  'Market sentiment analysis indicates overreaction. Taking contrarian position for value.',
  'Correlation with historical patterns suggests high confidence in this direction.',
  'Risk-reward ratio is favorable at current price levels. Entering position.',
  'Hedging existing exposure by taking opposite position in correlated market.',
  'Volume analysis shows smart money accumulation. Following institutional flow.',
  'Event timing creates asymmetric opportunity. Limited downside with significant upside.',
];

// Sample broadcast content
const BROADCAST_CONTENT = {
  analysis: [
    'Analyzing current market conditions across prediction markets. Seeing opportunities in economic indicators.',
    'Running sentiment analysis on social media data. Detecting shift in public opinion on key markets.',
    'Comparing current odds with historical baselines. Several markets appear mispriced.',
    'Evaluating correlation matrix between active positions. Portfolio diversification looks healthy.',
  ],
  trade: [
    'Executed trade based on momentum strategy. Confidence level high.',
    'Position adjusted to optimize risk-reward profile.',
    'Taking profit on winning position. Locking in gains.',
    'Cutting losses on underperforming position. Preserving capital.',
  ],
  commentary: [
    'Market volatility has increased significantly. Adjusting trading frequency.',
    'Interesting divergence between related markets. Monitoring for arbitrage.',
    'News cycle creating short-term opportunities. Staying nimble.',
    'End of day review: Portfolio performance tracking ahead of benchmark.',
  ],
};

// Generate mock trades
export function generateMockTrades(
  count: number,
  portfolioId: string,
  startTime: Date = new Date(Date.now() - 24 * 60 * 60 * 1000)
): Trade[] {
  const trades: Trade[] = [];
  const timeIncrement = (Date.now() - startTime.getTime()) / count;

  for (let i = 0; i < count; i++) {
    const market = MOCK_MARKETS[Math.floor(Math.random() * MOCK_MARKETS.length)];
    const side: PositionSide = Math.random() > 0.5 ? 'yes' : 'no';
    const action: TradeAction = Math.random() > 0.3 ? 'buy' : 'sell';
    const quantity = Math.floor(Math.random() * 100) + 10;
    const price = side === 'yes' ? market.yesPrice : market.noPrice;
    const notional = quantity * price;

    trades.push({
      id: generateId(),
      portfolioId,
      marketTicker: market.ticker,
      marketTitle: market.title,
      side,
      action,
      quantity,
      price,
      notional,
      pnl: action === 'sell' ? (Math.random() - 0.4) * notional * 0.3 : undefined,
      reasoning: TRADE_REASONING[Math.floor(Math.random() * TRADE_REASONING.length)],
      createdAt: new Date(startTime.getTime() + i * timeIncrement),
    });
  }

  return trades.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// Generate mock trades with model info
export function generateMockTradesWithModels(
  tradesPerModel: number = 5
): TradeWithModel[] {
  const trades: TradeWithModel[] = [];
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  DEFAULT_ARENA_MODELS.forEach((modelData, modelIndex) => {
    const model: ArenaModel = {
      ...modelData,
      id: generateId(),
      createdAt: new Date(),
    };

    for (let i = 0; i < tradesPerModel; i++) {
      const market = MOCK_MARKETS[Math.floor(Math.random() * MOCK_MARKETS.length)];
      const side: PositionSide = Math.random() > 0.5 ? 'yes' : 'no';
      const action: TradeAction = Math.random() > 0.3 ? 'buy' : 'sell';
      const quantity = Math.floor(Math.random() * 100) + 10;
      const price = side === 'yes' ? market.yesPrice : market.noPrice;
      const notional = quantity * price;

      trades.push({
        id: generateId(),
        portfolioId: generateId(),
        marketTicker: market.ticker,
        marketTitle: market.title,
        side,
        action,
        quantity,
        price,
        notional,
        pnl: action === 'sell' ? (Math.random() - 0.4) * notional * 0.3 : undefined,
        reasoning: TRADE_REASONING[Math.floor(Math.random() * TRADE_REASONING.length)],
        createdAt: new Date(dayAgo + Math.random() * (now - dayAgo)),
        model,
      });
    }
  });

  return trades.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// Generate mock positions
export function generateMockPositions(portfolioId: string): Position[] {
  const positions: Position[] = [];
  const usedMarkets = new Set<string>();

  // Generate 3-6 random positions
  const numPositions = Math.floor(Math.random() * 4) + 3;

  for (let i = 0; i < numPositions; i++) {
    let market;
    do {
      market = MOCK_MARKETS[Math.floor(Math.random() * MOCK_MARKETS.length)];
    } while (usedMarkets.has(market.ticker));
    usedMarkets.add(market.ticker);

    const side: PositionSide = Math.random() > 0.5 ? 'yes' : 'no';
    const quantity = Math.floor(Math.random() * 200) + 20;
    const avgEntryPrice = (side === 'yes' ? market.yesPrice : market.noPrice) * (0.9 + Math.random() * 0.2);
    const currentPrice = side === 'yes' ? market.yesPrice : market.noPrice;
    const currentValue = quantity * currentPrice;
    const costBasis = quantity * avgEntryPrice;

    positions.push({
      id: generateId(),
      portfolioId,
      marketTicker: market.ticker,
      marketTitle: market.title,
      side,
      quantity,
      avgEntryPrice: Math.round(avgEntryPrice * 100) / 100,
      status: 'open',
      openedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      currentPrice,
      currentValue: Math.round(currentValue * 100) / 100,
      unrealizedPnl: Math.round((currentValue - costBasis) * 100) / 100,
    });
  }

  return positions;
}

// Generate mock broadcasts
export function generateMockBroadcasts(
  sessionId: string,
  count: number = 20
): BroadcastWithModel[] {
  const broadcasts: BroadcastWithModel[] = [];
  const now = Date.now();
  const hoursAgo = now - 4 * 60 * 60 * 1000;

  const types: BroadcastType[] = ['analysis', 'trade', 'commentary'];

  for (let i = 0; i < count; i++) {
    const modelData = DEFAULT_ARENA_MODELS[Math.floor(Math.random() * DEFAULT_ARENA_MODELS.length)];
    const model: ArenaModel = {
      ...modelData,
      id: generateId(),
      createdAt: new Date(),
    };

    const type = types[Math.floor(Math.random() * types.length)];
    const contentArray = BROADCAST_CONTENT[type];
    const content = contentArray[Math.floor(Math.random() * contentArray.length)];

    broadcasts.push({
      id: generateId(),
      sessionId,
      modelId: model.id,
      type,
      content,
      createdAt: new Date(hoursAgo + Math.random() * (now - hoursAgo)),
      model,
    });
  }

  return broadcasts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
