# Performance Chart Axis Improvements

Improve the Y-axis and X-axis behavior in `PerformanceChart.tsx` for better visualization.

---

## Overview

| Axis | Current Behavior | Target Behavior |
|------|------------------|-----------------|
| Y-axis | Dynamic min/max based on data with padding | Start from $0, max at least 2× starting capital, auto-expand with padding |
| X-axis | Extends one median interval beyond last data point | Always show 1 hour ahead of current time (real-time update) |

---

## Requirements

### 1. Y-Axis: Start from $0, max at least 2× starting capital

**Rules:**
- **Min**: Always `0` (dollar mode) or `0%` (percent mode)
- **Max**: `max(2 × startingCapital, highestActualValue + 10% padding)`
  - Default: Starting capital = $100 → default max = $200
  - Auto-expand: If any agent hits $250, max becomes ~$275 (with 10% headroom)
- **Percent mode**: Same rule → 0% to +100% minimum, auto-expanding with padding
- **No negative values**: Agents die at $0, so no need to handle negative

### 2. X-Axis: Always show 1 hour ahead of current time

**Rules:**
- **Min**: First data point timestamp (or session start)
- **Max**: `now + 1 hour` (updates in real-time)
- Creates consistent empty space on the right for future data points
- Should update every minute to maintain the 1-hour buffer

---

## Files to Modify

### `components/chart/PerformanceChart.tsx`

#### 1. Y-Axis Domain (`yDomain` memo, ~line 400)

Replace the current `yDomain` calculation:

```typescript
// Calculate Y-axis domain: start from 0, max at least 2x starting capital
const yDomain = useMemo(() => {
  const excludeKeys = new Set(["timestamp", "_ts"]);
  const defaultMax = DEFAULT_STARTING_CAPITAL * 2; // $200 for $100 starting

  if (valueDisplay === "percent") {
    // Percent mode: 0% to +100% minimum
    const defaultMaxPercent = 100; // +100% = 2x starting capital
    
    let actualMax = 0;
    chartData.forEach((point) => {
      Object.entries(point).forEach(([key, value]) => {
        if (!excludeKeys.has(key) && typeof value === "number") {
          actualMax = Math.max(actualMax, value);
        }
      });
    });

    // Use default or actual max (with 10% padding if exceeding default)
    const maxY = actualMax > defaultMaxPercent
      ? actualMax * 1.1
      : defaultMaxPercent;

    return [0, Math.ceil(maxY)];
  }

  // Dollar mode: $0 to 2x starting capital minimum
  let actualMax = 0;
  chartData.forEach((point) => {
    Object.entries(point).forEach(([key, value]) => {
      if (!excludeKeys.has(key) && typeof value === "number") {
        actualMax = Math.max(actualMax, value);
      }
    });
  });

  // Use default or actual max (with 10% padding if exceeding default)
  const maxY = actualMax > defaultMax
    ? actualMax * 1.1
    : defaultMax;

  return [0, Math.ceil(maxY)];
}, [chartData, valueDisplay]);
```

#### 2. X-Axis Domain with Real-time Update (~line 434)

Add state for current time and interval to update it:

```typescript
// Real-time current time for X-axis (updates every minute)
const [now, setNow] = useState(() => Date.now());

useEffect(() => {
  const interval = setInterval(() => {
    setNow(Date.now());
  }, 60 * 1000); // Update every minute

  return () => clearInterval(interval);
}, []);

// Calculate X-axis domain: first data point to now + 1 hour
const xDomain = useMemo((): [number, number] => {
  const oneHourLater = now + 60 * 60 * 1000;

  // Start from first data point, or "now" if no data
  const firstTimestamp = chartData.length > 0
    ? (chartData[0]._ts as number)
    : now;

  return [firstTimestamp, oneHourLater];
}, [chartData, now]);
```

---

## Implementation Checklist

- [ ] Update `yDomain` calculation in `PerformanceChart.tsx`:
  - [ ] Set min to 0 for both dollar and percent modes
  - [ ] Set default max to 2× starting capital ($200 / +100%)
  - [ ] Auto-expand with 10% padding when values exceed default max
- [ ] Update `xDomain` calculation in `PerformanceChart.tsx`:
  - [ ] Add `now` state with initial value of `Date.now()`
  - [ ] Add `useEffect` interval to update `now` every minute
  - [ ] Calculate max as `now + 1 hour`
  - [ ] Keep min as first data point timestamp

---

## Visual Behavior

```
Dollar Mode ($100 starting capital):
┌────────────────────────────────────────┐
│ $200 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  ← Default max (2×)
│                                        │
│ $100 ───────────────────────           │  ← Starting capital line
│                                        │
│   $0 ──────────────────────────────────│  ← Fixed min
└────────────────────────────────────────┘
     10pm                    11pm (now+1h)
                              ↑
                         Always 1h ahead

If agent reaches $250:
┌────────────────────────────────────────┐
│ $275 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │  ← Auto-expanded (250 × 1.1)
│ $250 ────────────────/                 │  ← Actual peak
│ $200 ─ ─ ─ ─ ─ ─ ─/─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ $100 ───────────/──────────            │
│   $0 ──────────────────────────────────│
└────────────────────────────────────────┘
```
