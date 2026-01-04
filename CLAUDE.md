# "Dead" Model State for PerformanceChart

Add visual indication when an LLM model's portfolio value drops to 0 or below ("dies"). Dead models display with muted grey styling across all UI elements.

---

## Overview

When a model's `latestValue <= 0`, apply a "dead" state that persists for the session:
- **Line**: Solid grey color
- **Avatar/Logo**: CSS grayscale filter  
- **Value number**: Grey/muted color
- **Legend entry**: Grey/muted styling

---

## Files to Modify

### 1. `hooks/index/usePerformanceChart.ts`

**Changes:**
- Add `deadModels: Set<string>` to track which models have died
- Once a model's value `<= 0`, add to `deadModels` set (never removed)
- Return `deadModels` from the hook

**Updated Return Type:**

```typescript
interface UsePerformanceChartReturn {
  chartData: ChartDataPoint[];
  latestValues: Map<string, number>;
  deadModels: Set<string>;  // NEW
  loading: boolean;
  error: Error | null;
}
```

**Implementation Details:**

1. Add state: `const [deadModels, setDeadModels] = useState<Set<string>>(new Set());`

2. In initial fetch, after setting `latestValues`, check each value:
```typescript
const dead = new Set<string>();
for (const [modelName, value] of latest) {
  if (value <= 0) {
    dead.add(modelName);
  }
}
if (dead.size > 0) {
  setDeadModels(dead);
}
```

3. In realtime subscription handler, after updating `latestValues`:
```typescript
if (newPoint.portfolio_value_after <= 0) {
  setDeadModels((prev) => new Set(prev).add(newPoint.model_name));
}
```

4. Return `deadModels` in the hook return object

---

### 2. `components/index/PerformanceChart.tsx`

**Changes:**

#### Props Update
Add `deadModels` to component props:
```typescript
interface PerformanceChartProps {
  data: ChartDataPoint[];
  title?: string;
  latestValues?: Map<string, number>;
  leaderboard?: LeaderboardEntry[];
  deadModels?: Set<string>;  // NEW
}
```

#### Constants
Define the dead/muted grey color at the top:
```typescript
const DEAD_MODEL_COLOR = "hsl(var(--muted-foreground))"; // ~oklch(0.551 0.027 264.364) in dark mode
```

#### Line Styling (in `modelNames.map()`)
```typescript
const isDead = deadModels?.has(name) ?? false;
const lineColor = isDead ? DEAD_MODEL_COLOR : color;

<Line
  key={name}
  type="monotone"
  dataKey={name}
  stroke={lineColor}  // Use grey if dead
  strokeWidth={isHovered ? 3 : 2}
  strokeOpacity={isDimmed ? 0.2 : (isDead ? 0.6 : 1)}  // Slightly faded if dead
  // ... rest unchanged
>
```

#### LineEndLabel Component
Add `isDead` prop and apply styles:

```typescript
interface LineEndLabelProps {
  // ... existing props
  isDead: boolean;  // NEW
}

function LineEndLabel({ /* ... */, isDead }: LineEndLabelProps) {
  // Avatar with grayscale filter when dead
  <Avatar
    className={cn(
      "size-5 ring-[1.5px] ring-offset-0 bg-background shrink-0",
      isHovered && "ring-2",
      isDead && "grayscale opacity-60"  // NEW: grayscale + muted
    )}
    style={{
      ["--tw-ring-color" as string]: isDead ? DEAD_MODEL_COLOR : color,
    }}
  >
  
  // Value text color when dead
  <span
    className={cn(
      "text-[11px] font-semibold whitespace-nowrap tabular-nums",
      isDead && "text-muted-foreground",  // Grey when dead
      !isDead && valueDisplay === "percent" && (isPositive ? "text-green-500" : "text-red-500"),
    )}
    style={{
      color: isDead ? undefined : (valueDisplay === "dollar" ? color : undefined),
    }}
  >
```

Pass `isDead` when rendering LineEndLabel:
```typescript
<LineEndLabel
  {...props}
  dataLength={chartData.length}
  modelName={name}
  color={lineColor}
  isHovered={isHovered}
  isDimmed={isDimmed}
  isDead={isDead}  // NEW
  onHover={setHoveredModel}
  latestValue={latestValues?.get(name) ?? DEFAULT_STARTING_CAPITAL}
  valueDisplay={valueDisplay}
/>
```

#### CustomLegend Component
Add `deadModels` prop and apply styles:

```typescript
interface CustomLegendProps {
  // ... existing props
  deadModels?: Set<string>;  // NEW
}

function CustomLegend({ /* ... */, deadModels }: CustomLegendProps) {
  // In the map function:
  const isDead = deadModels?.has(model.name) ?? false;
  
  return (
    <div
      key={model.name}
      className={cn(
        "flex items-center gap-1 px-1 rounded transition-opacity cursor-default text-xs",
        "hover:bg-muted/50",
        isDimmed && "opacity-30",
        isDead && "opacity-60"  // Muted when dead
      )}
      // ...
    >
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: isDead ? DEAD_MODEL_COLOR : model.color }}
      />
      <span className={cn("font-medium", isDead && "text-muted-foreground")}>
        {model.name}
      </span>
      <span
        className={cn(
          "font-medium",
          isDead ? "text-muted-foreground" : (isPositive ? "text-green-500" : "text-red-500")
        )}
      >
        {/* ... percent display */}
      </span>
    </div>
  );
}
```

Pass `deadModels` to CustomLegend:
```typescript
<Legend
  content={
    <CustomLegend
      latestValues={latestValues}
      leaderboard={leaderboard}
      hoveredModel={hoveredModel}
      onModelHover={setHoveredModel}
      deadModels={deadModels}  // NEW
    />
  }
  verticalAlign="bottom"
/>
```

---

## Styling Reference (from globals.css)

Using existing CSS variables for consistent theming:
- `--muted-foreground`: `oklch(0.551 0.027 264.364)` (light) / `oklch(0.707 0.022 261.325)` (dark)
- Access via: `hsl(var(--muted-foreground))` or Tailwind class `text-muted-foreground`

---

## Implementation Checklist

- [ ] `hooks/index/usePerformanceChart.ts`:
  - [ ] Add `deadModels` state as `Set<string>`
  - [ ] Check for dead models on initial fetch (`value <= 0`)
  - [ ] Check for dead models on realtime update
  - [ ] Return `deadModels` from hook

- [ ] `components/index/PerformanceChart.tsx`:
  - [ ] Add `deadModels` to `PerformanceChartProps`
  - [ ] Define `DEAD_MODEL_COLOR` constant
  - [ ] Update Line stroke to use grey when dead
  - [ ] Add `isDead` prop to `LineEndLabelProps`
  - [ ] Apply `grayscale opacity-60` to Avatar when dead
  - [ ] Apply `text-muted-foreground` to value text when dead
  - [ ] Add `deadModels` prop to `CustomLegendProps`
  - [ ] Apply grey styling to legend entries for dead models

- [ ] Update parent component (where `usePerformanceChart` is called):
  - [ ] Pass `deadModels` to `PerformanceChart` component

---

## Visual Summary

| Element | Normal State | Dead State |
|---------|--------------|------------|
| Line | Model's `chartColor` | `hsl(var(--muted-foreground))` solid grey |
| Avatar | Full color | `grayscale opacity-60` |
| Ring | Model's `chartColor` | `hsl(var(--muted-foreground))` |
| Value Number | Green/red or model color | `text-muted-foreground` |
| Legend Dot | Model's `chartColor` | `hsl(var(--muted-foreground))` |
| Legend Text | Normal + green/red % | `text-muted-foreground` |

---

## Notes

- **Threshold**: `<= 0` to handle floating point edge cases
- **Persistence**: Once dead, always dead for the session (Set never removes items)
- **Hover still works**: Dead models can still be hovered/highlighted, just with grey styling
- **Consistent theming**: Uses existing `--muted-foreground` CSS variable for proper light/dark mode support
