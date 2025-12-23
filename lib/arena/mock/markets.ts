import type { PredictionMarket } from '@/types/arena';

// Mock Kalshi-style prediction markets
export const MOCK_MARKETS: PredictionMarket[] = [
  {
    ticker: 'FED-RATE-JAN25',
    title: 'Will the Fed cut rates in January 2025?',
    category: 'Economics',
    yesPrice: 0.35,
    noPrice: 0.65,
    volume: 1250000,
    expirationDate: new Date('2025-01-31'),
    status: 'open',
  },
  {
    ticker: 'BTC-100K-Q1',
    title: 'Will Bitcoin reach $100,000 in Q1 2025?',
    category: 'Finance',
    yesPrice: 0.72,
    noPrice: 0.28,
    volume: 3500000,
    expirationDate: new Date('2025-03-31'),
    status: 'open',
  },
  {
    ticker: 'SNOW-NYC-DEC',
    title: 'Will NYC get 6+ inches of snow in December?',
    category: 'Weather',
    yesPrice: 0.45,
    noPrice: 0.55,
    volume: 450000,
    expirationDate: new Date('2024-12-31'),
    status: 'open',
  },
  {
    ticker: 'OSCAR-BEST-PIC',
    title: 'Will "Anora" win Best Picture at the Oscars?',
    category: 'Entertainment',
    yesPrice: 0.28,
    noPrice: 0.72,
    volume: 890000,
    expirationDate: new Date('2025-03-02'),
    status: 'open',
  },
  {
    ticker: 'GDP-Q4-GROWTH',
    title: 'Will Q4 2024 GDP growth exceed 3%?',
    category: 'Economics',
    yesPrice: 0.58,
    noPrice: 0.42,
    volume: 2100000,
    expirationDate: new Date('2025-01-30'),
    status: 'open',
  },
  {
    ticker: 'NVIDIA-EARNINGS',
    title: 'Will NVIDIA beat Q4 earnings estimates?',
    category: 'Finance',
    yesPrice: 0.68,
    noPrice: 0.32,
    volume: 4200000,
    expirationDate: new Date('2025-02-21'),
    status: 'open',
  },
  {
    ticker: 'AI-REGULATION',
    title: 'Will US pass major AI regulation in 2025?',
    category: 'Politics',
    yesPrice: 0.22,
    noPrice: 0.78,
    volume: 1800000,
    expirationDate: new Date('2025-12-31'),
    status: 'open',
  },
  {
    ticker: 'SPACEX-STARSHIP',
    title: 'Will SpaceX successfully land Starship by Feb 2025?',
    category: 'Science',
    yesPrice: 0.55,
    noPrice: 0.45,
    volume: 920000,
    expirationDate: new Date('2025-02-28'),
    status: 'open',
  },
  {
    ticker: 'SUPERBOWL-CHIEFS',
    title: 'Will the Chiefs win Super Bowl LIX?',
    category: 'Sports',
    yesPrice: 0.18,
    noPrice: 0.82,
    volume: 5600000,
    expirationDate: new Date('2025-02-09'),
    status: 'open',
  },
  {
    ticker: 'APPLE-VR-SALES',
    title: 'Will Apple Vision Pro sell 1M+ units in 2025?',
    category: 'Technology',
    yesPrice: 0.32,
    noPrice: 0.68,
    volume: 1450000,
    expirationDate: new Date('2025-12-31'),
    status: 'open',
  },
];

// Get a random subset of markets
export function getRandomMarkets(count: number = 5): PredictionMarket[] {
  const shuffled = [...MOCK_MARKETS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Simulate price movement for a market
export function simulatePriceChange(market: PredictionMarket): PredictionMarket {
  const maxChange = 0.03; // Max 3% change
  const change = (Math.random() - 0.5) * 2 * maxChange;

  let newYesPrice = market.yesPrice + change;
  // Clamp between 0.01 and 0.99
  newYesPrice = Math.max(0.01, Math.min(0.99, newYesPrice));

  return {
    ...market,
    yesPrice: Math.round(newYesPrice * 100) / 100,
    noPrice: Math.round((1 - newYesPrice) * 100) / 100,
    volume: market.volume + Math.floor(Math.random() * 10000),
  };
}

// Get market by ticker
export function getMarketByTicker(ticker: string): PredictionMarket | undefined {
  return MOCK_MARKETS.find(m => m.ticker === ticker);
}

// Get markets by category
export function getMarketsByCategory(category: string): PredictionMarket[] {
  return MOCK_MARKETS.filter(m => m.category === category);
}
