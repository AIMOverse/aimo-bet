# Implementation Plan: Performance Chart UX Improvements

## Overview

Improve the P&L Performance Chart UX with three targeted changes:
1. **Y-Axis**: Data-driven nice values (always include zero)
2. **X-Axis**: Live mode with smart buffer and minimum width
3. **Token Usage**: Progress bar showing power remaining + numeric fallback

### Files to Modify

```
components/chart/PerformanceChart.tsx
├── Update yDomain calculation (data-driven)
├── Update xDomain calculation (smart buffer)
├── Add TokenProgress component
└── Update LineEndLabel and CustomLegend

lib/config.ts (optional)
└── Add TOKEN_BUDGET_DOLLARS constant
```

---

## 1. Y-Axis: Data-Driven Nice Values

### Current Problem

The Y-axis uses fixed "nice" values and forces symmetric bounds around zero. When data is all negative (e.g., -700 to -100), the chart shows ±500 or ±1000, wasting vertical space.

### Solution

Calculate nice intervals based on actual data range while always including zero.

### Implementation

Replace `getNiceAxisMax()` and the `yDomain` calculation:

```typescript
/**
 * Calculate data-driven axis bounds that:
 * 1. Always include zero (for P&L context)
 * 2. Use nice intervals based on actual data range
 * 3. Add minimal padding for breathing room
 */
function getDataDrivenAxisBounds(
  dataMin: number,
  dataMax: number,
  isPercent: boolean
): { min: number; max: number } {
  // Always include zero in the range
  const rangeMin = Math.min(dataMin, 0);
  const rangeMax = Math.max(dataMax, 0);
  const range = rangeMax - rangeMin;

  // Handle empty/minimal data
  if (range < (isPercent ? 1 : 10)) {
    const defaultPadding = isPercent ? 10 : 100;
    return {
      min: Math.min(rangeMin, -defaultPadding),
      max: Math.max(rangeMax, defaultPadding),
    };
  }

  // Calculate nice interval targeting ~5-7 tick marks
  const rawInterval = range / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
  const normalized = rawInterval / magnitude;

  // Round to nearest nice multiplier
  let niceMultiplier: number;
  if (normalized <= 1) niceMultiplier = 1;
  else if (normalized <= 2) niceMultiplier = 2;
  else if (normalized <= 2.5) niceMultiplier = 2.5;
  else if (normalized <= 5) niceMultiplier = 5;
  else niceMultiplier = 10;

  const interval = niceMultiplier * magnitude;

  // Extend to nice boundaries
  const niceMin = Math.floor(rangeMin / interval) * interval;
  const niceMax = Math.ceil(rangeMax / interval) * interval;

  // Add half-interval padding
  const padding = interval * 0.5;

  return {
    min: niceMin - padding,
    max: niceMax + padding,
  };
}
```

Update `yDomain` useMemo:

```typescript
const yDomain = useMemo((): [number, number] => {
  const excludeKeys = new Set(["timestamp", "_ts"]);

  let actualMin = Infinity;
  let actualMax = -Infinity;

  chartData.forEach((point) => {
    Object.entries(point).forEach(([key, value]) => {
      if (!excludeKeys.has(key) && typeof value === "number") {
        actualMin = Math.min(actualMin, value);
        actualMax = Math.max(actualMax, value);
      }
    });
  });

  const isPercent = valueDisplay === "percent";

  // Handle empty data
  if (!isFinite(actualMax) || !isFinite(actualMin)) {
    const defaultMax = isPercent ? 10 : 100;
    return [-defaultMax, defaultMax];
  }

  const bounds = getDataDrivenAxisBounds(actualMin, actualMax, isPercent);
  return [bounds.min, bounds.max];
}, [chartData, valueDisplay]);
```

### Expected Behavior

| Data Range | Old Bounds | New Bounds |
|------------|------------|------------|
| -700 to -100 | -1000 to +1000 | -800 to +100 |
| -50 to +200 | -250 to +250 | -100 to +250 |
| +100 to +500 | -500 to +500 | -50 to +600 |
| 0 to 0 | -100 to +100 | -100 to +100 |

---

## 2. X-Axis: Live Mode with Smart Buffer

### Current Problem

X-axis domain is `[firstDataPoint, now + 1 hour]`, causing data to bunch on the left when the data span is short.

### Solution

Use `[firstDataPoint, lastDataPoint + dynamicBuffer]` with:
- Dynamic buffer: 10% of data span, clamped between 5-30 minutes
- Minimum total width: 30 minutes (so single data points don't look cramped)

### Implementation

```typescript
const xDomain = useMemo((): [number, number] => {
  // Constants
  const MIN_BUFFER_MS = 5 * 60 * 1000;      // 5 minutes
  const MAX_BUFFER_MS = 30 * 60 * 1000;     // 30 minutes
  const MIN_SPAN_MS = 30 * 60 * 1000;       // 30 minutes minimum width

  if (chartData.length === 0) {
    // Fallback: show 30-minute window from now
    return [now, now + MIN_SPAN_MS];
  }

  const firstTs = chartData[0]._ts as number;
  const lastTs = chartData[chartData.length - 1]._ts as number;
  const dataSpan = lastTs - firstTs;

  // Dynamic buffer: 10% of span, clamped
  const buffer = Math.max(MIN_BUFFER_MS, Math.min(MAX_BUFFER_MS, dataSpan * 0.1));

  // Calculate end time
  let endTs = lastTs + buffer;

  // Enforce minimum span
  const totalSpan = endTs - firstTs;
  if (totalSpan < MIN_SPAN_MS) {
    endTs = firstTs + MIN_SPAN_MS;
  }

  return [firstTs, endTs];
}, [chartData, now]);
```

### Expected Behavior

| Data Span | Buffer | Total Width |
|-----------|--------|-------------|
| 0 (1 point) | 5 min | 30 min (minimum) |
| 10 min | 5 min (minimum) | 30 min (minimum) |
| 2 hours | 12 min (10%) | 2h 12m |
| 6 hours | 30 min (max) | 6h 30m |

---

## 3. Token Usage: Progress Bar + Numeric

### Design

Show "power remaining" as a progress bar that depletes as tokens are consumed, plus numeric token count.

### Configuration

Add to `lib/config.ts`:

```typescript
// Dollar budget per model for token usage display
// When spent reaches this amount, the progress bar shows 0% remaining
export const TOKEN_BUDGET_DOLLARS = 20;
```

### New Component: TokenProgress

```typescript
interface TokenProgressProps {
  tokensUsed: number;
  costPerMillion: number;
  budget?: number;  // Dollar budget, defaults to TOKEN_BUDGET_DOLLARS
  compact?: boolean; // For line-end labels (smaller)
}

function TokenProgress({
  tokensUsed,
  costPerMillion,
  budget = TOKEN_BUDGET_DOLLARS,
  compact = false,
}: TokenProgressProps) {
  // Calculate dollars spent
  const dollarsSpent = (tokensUsed * costPerMillion) / 1_000_000;
  const percentUsed = Math.min(100, (dollarsSpent / budget) * 100);
  const percentRemaining = 100 - percentUsed;

  // Color based on remaining power
  const getColor = () => {
    if (percentRemaining > 50) return "bg-green-500";
    if (percentRemaining > 25) return "bg-yellow-500";
    if (percentRemaining > 0) return "bg-red-500";
    return "bg-muted-foreground"; // Depleted
  };

  if (compact) {
    // For line-end labels: narrow bar + token count
    return (
      <div className="flex items-center gap-1">
        <div className="w-8 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", getColor())}
            style={{ width: `${percentRemaining}%` }}
          />
        </div>
        <span className="text-[9px] text-muted-foreground whitespace-nowrap">
          {formatTokens(tokensUsed)}
        </span>
      </div>
    );
  }

  // For legend: wider bar + percentage + token count
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", getColor())}
          style={{ width: `${percentRemaining}%` }}
        />
      </div>
      <span className="text-[9px] text-muted-foreground whitespace-nowrap">
        {Math.round(percentRemaining)}%
      </span>
      <span className="text-[9px] text-muted-foreground whitespace-nowrap">
        ({formatTokens(tokensUsed)})
      </span>
    </div>
  );
}
```

### Update LineEndLabel

Replace the current token display:

```typescript
// Current (line ~296):
<span className="text-[9px] text-muted-foreground whitespace-nowrap">
  {formatTokens(totalTokens)} / ${costPerMillion.toFixed(2)}
</span>

// New:
<TokenProgress
  tokensUsed={totalTokens}
  costPerMillion={costPerMillion}
  compact={true}
/>
```

### Update CustomLegend

Replace the current token display in legend items:

```typescript
// Current (line ~396):
<span className="text-muted-foreground text-[10px]">
  ({formatTokens(model.tokens)} / ${costPerMillion.toFixed(2)})
</span>

// New:
<TokenProgress
  tokensUsed={model.tokens}
  costPerMillion={costPerMillion}
  compact={false}
/>
```

### Visual Design

**Line-end label (compact)**:
```
[Avatar] -$200.82 [████░░] 123.1M
                  ^progress ^tokens
```

**Legend (full)**:
```
● Claude Sonnet 4.5 -57.6% [████████░░] 67% (131.7M)
                           ^progress   ^pct ^tokens
```

### Color Thresholds

| Remaining | Color | Meaning |
|-----------|-------|---------|
| 100-50% | Green | Healthy |
| 50-25% | Yellow | Caution |
| 25-1% | Red | Low power |
| 0% | Gray | Depleted |

---

## 4. Implementation Checklist

- [ ] Update `components/chart/PerformanceChart.tsx`
  - [ ] Replace `getNiceAxisMax()` with `getDataDrivenAxisBounds()`
  - [ ] Update `yDomain` useMemo to use new bounds function
  - [ ] Update `xDomain` useMemo with smart buffer + minimum width
  - [ ] Add `TokenProgress` component
  - [ ] Update `LineEndLabel` to use `TokenProgress` (compact)
  - [ ] Update `CustomLegend` to use `TokenProgress` (full)
  - [ ] Import `TOKEN_BUDGET_DOLLARS` from config

- [ ] Update `lib/config.ts`
  - [ ] Add `TOKEN_BUDGET_DOLLARS` constant (default: $20)

- [ ] Testing
  - [ ] Verify Y-axis tightens to data range while including zero
  - [ ] Verify X-axis ends near last data point with appropriate buffer
  - [ ] Verify minimum 30-minute width when data span is small
  - [ ] Verify progress bar shows correct colors at thresholds
  - [ ] Verify numeric token count displays correctly

---

## 5. Configuration Options

| Constant | Value | Location | Description |
|----------|-------|----------|-------------|
| `TOKEN_BUDGET_DOLLARS` | 20 | lib/config.ts | Dollar budget per model |
| `MIN_BUFFER_MS` | 5 min | PerformanceChart.tsx | Minimum X-axis buffer |
| `MAX_BUFFER_MS` | 30 min | PerformanceChart.tsx | Maximum X-axis buffer |
| `MIN_SPAN_MS` | 30 min | PerformanceChart.tsx | Minimum chart width |

---

## 6. Future Enhancements (Optional)

- **Per-model budgets**: Allow different budgets for expensive vs cheap models
- **Budget exhaustion callback**: Trigger event when a model depletes its budget
- **Zoom controls**: Allow user to zoom/pan the chart manually
- **Time range selector**: Quick buttons for 1h, 6h, 24h views
