import type {
  ArenaModel,
  TradingSession,
  ModelPortfolio,
  Position,
  Trade,
  Broadcast,
  PerformanceSnapshot,
  SessionStatus,
  PositionSide,
  TradeAction,
  BroadcastType,
} from "@/types/arena";

const API_BASE = "/api/arena";

// ============================================================================
// SESSIONS
// ============================================================================

export async function fetchSessions(): Promise<TradingSession[]> {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function fetchActiveSession(): Promise<TradingSession | null> {
  const res = await fetch(`${API_BASE}/sessions?active=true`);
  if (!res.ok) throw new Error("Failed to fetch active session");
  return res.json();
}

export async function fetchSession(id: string): Promise<TradingSession> {
  const res = await fetch(`${API_BASE}/sessions?id=${id}`);
  if (!res.ok) throw new Error("Failed to fetch session");
  return res.json();
}

export async function createSession(
  name?: string,
  startingCapital?: number
): Promise<TradingSession> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, startingCapital }),
  });
  if (!res.ok) throw new Error("Failed to create session");
  return res.json();
}

export async function updateSessionStatus(
  id: string,
  status: SessionStatus
): Promise<void> {
  const res = await fetch(`${API_BASE}/sessions?id=${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update session status");
}

// ============================================================================
// MODELS
// ============================================================================

export async function fetchModels(all = false): Promise<ArenaModel[]> {
  const res = await fetch(`${API_BASE}/models${all ? "?all=true" : ""}`);
  if (!res.ok) throw new Error("Failed to fetch models");
  return res.json();
}

export async function fetchModel(id: string): Promise<ArenaModel> {
  const res = await fetch(`${API_BASE}/models?id=${id}`);
  if (!res.ok) throw new Error("Failed to fetch model");
  return res.json();
}

export async function createModel(
  model: Omit<ArenaModel, "id" | "createdAt">
): Promise<ArenaModel> {
  const res = await fetch(`${API_BASE}/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(model),
  });
  if (!res.ok) throw new Error("Failed to create model");
  return res.json();
}

export async function updateModel(
  id: string,
  updates: Partial<Omit<ArenaModel, "id" | "createdAt">>
): Promise<void> {
  const res = await fetch(`${API_BASE}/models?id=${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update model");
}

// ============================================================================
// PORTFOLIOS
// ============================================================================

export async function fetchSessionPortfolios(
  sessionId: string,
  includePositions = false
): Promise<ModelPortfolio[]> {
  const params = new URLSearchParams({ sessionId });
  if (includePositions) params.append("includePositions", "true");
  const res = await fetch(`${API_BASE}/portfolios?${params}`);
  if (!res.ok) throw new Error("Failed to fetch portfolios");
  return res.json();
}

export async function updatePortfolioCash(
  portfolioId: string,
  cashBalance: number
): Promise<void> {
  const res = await fetch(`${API_BASE}/portfolios?id=${portfolioId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cashBalance }),
  });
  if (!res.ok) throw new Error("Failed to update portfolio cash");
}

// ============================================================================
// TRADES
// ============================================================================

export async function fetchSessionTrades(
  sessionId: string,
  limit = 50
): Promise<Trade[]> {
  const res = await fetch(`${API_BASE}/trades?sessionId=${sessionId}&limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch trades");
  return res.json();
}

export async function createTrade(trade: {
  portfolioId: string;
  positionId?: string;
  marketTicker: string;
  marketTitle: string;
  side: PositionSide;
  action: TradeAction;
  quantity: number;
  price: number;
  pnl?: number;
  reasoning?: string;
}): Promise<Trade> {
  const res = await fetch(`${API_BASE}/trades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trade),
  });
  if (!res.ok) throw new Error("Failed to create trade");
  return res.json();
}

// ============================================================================
// POSITIONS
// ============================================================================

export async function fetchPortfolioPositions(
  portfolioId: string,
  openOnly = true
): Promise<Position[]> {
  const res = await fetch(
    `${API_BASE}/positions?portfolioId=${portfolioId}&openOnly=${openOnly}`
  );
  if (!res.ok) throw new Error("Failed to fetch positions");
  return res.json();
}

export async function createPosition(position: {
  portfolioId: string;
  marketTicker: string;
  marketTitle: string;
  side: PositionSide;
  quantity: number;
  avgEntryPrice: number;
}): Promise<Position> {
  const res = await fetch(`${API_BASE}/positions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(position),
  });
  if (!res.ok) throw new Error("Failed to create position");
  return res.json();
}

export async function closePosition(positionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/positions?id=${positionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "close" }),
  });
  if (!res.ok) throw new Error("Failed to close position");
}

// ============================================================================
// BROADCASTS
// ============================================================================

export async function fetchSessionBroadcasts(
  sessionId: string,
  limit = 50
): Promise<Broadcast[]> {
  const res = await fetch(`${API_BASE}/broadcasts?sessionId=${sessionId}&limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch broadcasts");
  return res.json();
}

export async function createBroadcast(broadcast: {
  sessionId: string;
  modelId: string;
  type: BroadcastType;
  content: string;
  relatedTradeId?: string;
}): Promise<Broadcast> {
  const res = await fetch(`${API_BASE}/broadcasts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(broadcast),
  });
  if (!res.ok) throw new Error("Failed to create broadcast");
  return res.json();
}

// ============================================================================
// SNAPSHOTS
// ============================================================================

export async function fetchPerformanceSnapshots(
  sessionId: string,
  hoursBack = 24
): Promise<PerformanceSnapshot[]> {
  const res = await fetch(
    `${API_BASE}/snapshots?sessionId=${sessionId}&hoursBack=${hoursBack}`
  );
  if (!res.ok) throw new Error("Failed to fetch snapshots");
  return res.json();
}

export async function createSnapshot(snapshot: {
  sessionId: string;
  modelId: string;
  accountValue: number;
}): Promise<PerformanceSnapshot> {
  const res = await fetch(`${API_BASE}/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!res.ok) throw new Error("Failed to create snapshot");
  return res.json();
}

export async function createBulkSnapshots(
  snapshots: Array<{
    sessionId: string;
    modelId: string;
    accountValue: number;
  }>
): Promise<void> {
  const res = await fetch(`${API_BASE}/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshots),
  });
  if (!res.ok) throw new Error("Failed to create snapshots");
}
