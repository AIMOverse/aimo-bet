// ============================================================================
// Polymarket Gamma API Types
// Docs: https://docs.polymarket.com/
// ============================================================================

// ============================================================================
// Common Types
// ============================================================================

export interface PaginationParams {
  limit: number;
  offset: number;
  order?: string;
  ascending?: boolean;
}

// ============================================================================
// Category Types
// ============================================================================

export interface Category {
  id: string;
  label: string;
}

// ============================================================================
// Tag Types
// ============================================================================

export interface Tag {
  id: string;
  label: string | null;
  slug: string | null;
  forceShow: boolean | null;
  forceHide: boolean | null;
  isCarousel: boolean | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: number | null;
  updatedBy: number | null;
}

export interface ListTagsParams extends PaginationParams {
  include_template?: boolean;
  is_carousel?: boolean;
}

// ============================================================================
// Market Types
// ============================================================================

export interface Market {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  description: string | null;
  category: string | null;
  marketType: string;
  formatType: string | null;
  outcomes: string[];
  outcomePrices: string[];
  active: boolean;
  closed: boolean;
  archived: boolean;
  featured: boolean;
  restricted: boolean;
  liquidity: number;
  liquidityNum: number;
  volume: number;
  volumeNum: number;
  volume24hr: number;
  volume1wk: number;
  volume1mo: number;
  volume1yr: number;
  lastTradePrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  oneDayPriceChange: number | null;
  oneWeekPriceChange: number | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  closedTime: string | null;
  acceptingOrders: boolean;
  enableOrderBook: boolean;
  makerBaseFee: number;
  takerBaseFee: number;
  events?: Event[];
  categories?: Category[];
  tags?: Tag[];
}

export interface ListMarketsParams extends PaginationParams {
  id?: number[];
  slug?: string[];
  clob_token_ids?: string[];
  condition_ids?: string[];
  market_maker_address?: string[];
  tag_id?: number;
  related_tags?: boolean;
  liquidity_num_min?: number;
  liquidity_num_max?: number;
  volume_num_min?: number;
  volume_num_max?: number;
  start_date_min?: string;
  start_date_max?: string;
  end_date_min?: string;
  end_date_max?: string;
  closed?: boolean;
  cyom?: boolean;
  uma_resolution_status?: string;
  game_id?: string;
  sports_market_types?: string[];
  rewards_min_size?: number;
  question_ids?: string[];
  include_tag?: boolean;
}

// ============================================================================
// Series Types
// ============================================================================

export interface Series {
  id: string;
  ticker: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  seriesType: string | null;
  recurrence: string | null;
  image: string | null;
  icon: string | null;
  active: boolean;
  closed: boolean;
  archived: boolean;
  new: boolean;
  featured: boolean;
  restricted: boolean;
  volume: number;
  volume24hr: number;
  liquidity: number;
  startDate: string | null;
  createdAt: string;
  updatedAt: string;
  events?: Event[];
  categories?: Category[];
  tags?: Tag[];
}

export interface ListSeriesParams extends PaginationParams {
  slug?: string[];
  categories_ids?: number[];
  categories_labels?: string[];
  closed?: boolean;
  include_chat?: boolean;
  recurrence?: string;
}

// ============================================================================
// Event Types
// ============================================================================

export interface Event {
  id: string;
  ticker: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string;
  resolutionSource: string | null;
  startDate: string | null;
  endDate: string | null;
  creationDate: string | null;
  closedTime: string | null;
  active: boolean;
  closed: boolean;
  archived: boolean;
  new: boolean;
  featured: boolean;
  restricted: boolean;
  liquidity: number;
  volume: number;
  openInterest: number;
  volume24hr: number;
  volume1wk: number;
  volume1mo: number;
  volume1yr: number;
  image: string | null;
  icon: string | null;
  featuredImage: string | null;
  commentCount: number;
  markets?: Market[];
  series?: Series[];
  categories?: Category[];
  tags?: Tag[];
}

export interface ListEventsParams extends PaginationParams {
  id?: number[];
  slug?: string[];
  tag_id?: number;
  tag_slug?: string;
  exclude_tag_id?: number[];
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  featured?: boolean;
  cyom?: boolean;
  related_tags?: boolean;
  include_chat?: boolean;
  include_template?: boolean;
  recurrence?: string;
  liquidity_min?: number;
  liquidity_max?: number;
  volume_min?: number;
  volume_max?: number;
  start_date_min?: string;
  start_date_max?: string;
  end_date_min?: string;
  end_date_max?: string;
}
