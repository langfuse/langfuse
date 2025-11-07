# Score Analytics - Architecture Guide

## Overview

Score Analytics provides a comprehensive dashboard for analyzing score data with support for single and two-score comparison modes. The architecture follows a **Provider + Hook + Smart Cards** pattern for clean separation of concerns and maximum code reuse.

## Architecture Principles

1. **Transform Once**: All data transformation happens in `useScoreAnalyticsQuery` hook (not in components)
2. **Single Source of Truth**: `ScoreAnalyticsProvider` exposes all data via React Context
3. **No Prop Drilling**: Smart cards consume context directly via `useScoreAnalytics()` hook
4. **Type-Safe**: Explicit TypeScript interfaces throughout
5. **Presentation vs Logic**: Chart components are pure presentation, cards handle logic

## Folder Structure

```
/score-analytics/
├── /components/
│   ├── /cards/                          # Smart cards (consume context)
│   │   ├── StatisticsCard.tsx          # Summary metrics
│   │   ├── TimelineChartCard.tsx       # Time series trends
│   │   ├── DistributionChartCard.tsx   # Score distributions
│   │   └── HeatmapCard.tsx             # Score comparisons (heatmap/confusion matrix)
│   │
│   ├── /charts/                         # Reusable chart components (presentation only)
│   │   ├── ScoreDistribution*.tsx      # Distribution charts (Numeric/Boolean/Categorical)
│   │   ├── ScoreTimeSeries*.tsx        # Timeline charts (Numeric/Boolean/Categorical)
│   │   ├── Heatmap*.tsx                # Heatmap components (Heatmap/Cell/Legend/Placeholder)
│   │   ├── MetricCard.tsx              # Metric display component
│   │   ├── ScoreCombobox.tsx           # Score selector dropdown
│   │   └── ObjectTypeFilter.tsx        # Object type filter
│   │
│   ├── ScoreAnalyticsHeader.tsx        # Header controls (score selectors, filters, date picker)
│   ├── ScoreAnalyticsDashboard.tsx     # 2x2 responsive grid layout
│   └── ScoreAnalyticsProvider.tsx      # Context provider (wraps hook + exposes data)
│
├── /hooks/
│   └── useScoreAnalyticsQuery.ts       # Data fetching + transformation hook
│
├── /transformers/
│   └── scoreAnalyticsTransformers.ts   # Pure transformation functions
│
└── README.md                            # This file
```

## Data Flow

```
Page (analytics.tsx)
  ↓
ScoreAnalyticsProvider (wraps dashboard)
  ↓
useScoreAnalyticsQuery hook
  ↓ (fetches data via tRPC)
  ↓ (transforms using pure functions)
  ↓ (returns structured data)
  ↓
React Context
  ↓
Smart Cards (consume via useScoreAnalytics)
  ↓
Chart Components (receive props)
```

## Key Components

### 1. ScoreAnalyticsProvider (`/components/ScoreAnalyticsProvider.tsx`)

**Purpose**: Context provider that wraps `useScoreAnalyticsQuery` and exposes data to child components.

**Responsibilities**:
- Calls `useScoreAnalyticsQuery` with query parameters
- Determines color scheme based on mode (single vs two scores)
- Exposes data, loading state, params, and colors via context

**Usage**:
```tsx
<ScoreAnalyticsProvider
  projectId="..."
  score1={{ id: "...", name: "...", source: "...", dataType: "NUMERIC" }}
  score2={...}  // optional
  objectType="TRACE"
  startDate={new Date()}
  endDate={new Date()}
  interval={{ count: 1, unit: "day" }}
>
  <ScoreAnalyticsDashboard />
</ScoreAnalyticsProvider>
```

### 2. useScoreAnalyticsQuery (`/hooks/useScoreAnalyticsQuery.ts`)

**Purpose**: Fetches data from API and transforms it ONCE using pure functions.

**Responsibilities**:
- Fetch data via tRPC (`api.scores.getScoreComparisonAnalytics`)
- Transform data using functions from `scoreAnalyticsTransformers.ts`:
  - Extract categories (categorical/boolean only)
  - Fill distribution bins (ensure all bins have data)
  - Generate bin labels (numeric only)
  - Transform heatmap data
  - Calculate mode metrics (categorical/boolean only)
  - Fill time series gaps
  - Namespace categorical time series (prevent category collisions)
- Return structured `ScoreAnalyticsData` object

**Key Interfaces**:
```typescript
interface ScoreAnalyticsQueryParams {
  projectId: string;
  score1: ScoreOption;
  score2?: ScoreOption;
  objectType: ObjectType;
  startDate: Date;
  endDate: Date;
  interval: { count: number; unit: string };
}

interface ScoreAnalyticsData {
  statistics: { score1, score2?, comparison? };
  distribution: { score1, score2?, binLabels?, categories?, etc. };
  timeSeries: { numeric, categorical };
  heatmapData: { cells, rowLabels, colLabels };
  metadata: { mode: "single" | "two", dataType, isSameScore };
}
```

### 3. Smart Cards (`/components/cards/`)

**Purpose**: Self-contained components that consume context and handle their own UI logic.

**Pattern**:
```tsx
export function ExampleCard() {
  const { data, isLoading, params, colors } = useScoreAnalytics();

  // Handle loading state
  if (isLoading) return <LoadingState />;

  // Handle empty state
  if (!data) return <EmptyState />;

  // Use data from context
  const { statistics, metadata } = data;

  // Render chart with transformed data
  return <ChartComponent data={...} />;
}
```

**All cards**:
- Consume `useScoreAnalytics()` hook (NOT props)
- Handle their own loading/empty states
- Use data directly from context (no prop drilling)
- Pass data to chart components as props

### 4. Chart Components (`/components/charts/`)

**Purpose**: Pure presentation components that receive data via props.

**Pattern**:
```tsx
interface ChartProps {
  data: SomeDataType;
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL";
  score1Name: string;
  score2Name?: string;
}

export function ExampleChart({ data, dataType, score1Name, score2Name }: ChartProps) {
  // Pure rendering logic only
  // No data fetching, no context, no transformations
  return <Recharts... />;
}
```

### 5. Transformers (`/transformers/scoreAnalyticsTransformers.ts`)

**Purpose**: Pure functions for data transformation (no side effects).

**Key Functions**:
- `extractCategories()` - Get unique categories from confusion matrix/stacked distribution
- `fillDistributionBins()` - Fill missing bins with zero counts
- `calculateModeMetrics()` - Calculate mode and mode percentage
- `transformHeatmapData()` - Transform API data for heatmaps/confusion matrices
- `generateBinLabels()` - Generate formatted bin labels for numeric distributions

**All functions**:
- Pure (same input → same output)
- No side effects
- Fully typed
- JSDoc documented

## Data Types Supported

1. **NUMERIC**: Continuous numeric scores
   - Distribution: Histogram with bins
   - Timeline: Line chart with averages
   - Comparison: Heatmap (10x10 bins), Pearson/Spearman correlation, MAE, RMSE

2. **BOOLEAN**: True/false scores
   - Distribution: Bar chart (2 categories)
   - Timeline: Stacked area chart
   - Comparison: Confusion matrix, Cohen's Kappa, F1 Score, Agreement

3. **CATEGORICAL**: Discrete category scores
   - Distribution: Bar chart (N categories)
   - Timeline: Stacked area chart
   - Comparison: Confusion matrix, Cohen's Kappa, F1 Score, Agreement

## Modes

1. **Single Score**: Analyze one score in isolation
   - Shows: Statistics, Timeline, Distribution
   - Hides: Comparison metrics, Heatmap

2. **Two Scores**: Compare two scores
   - Shows: All 4 cards with tabs (score1/score2/all/matched)
   - Comparison metrics: Correlation, agreement, error metrics
   - Heatmap: Visual correlation/confusion matrix

3. **Same Score Twice**: Edge case where same score selected twice
   - Treated as two-score mode
   - Uses source to differentiate (e.g., "accuracy (EVAL)" vs "accuracy (ANNOTATION)")

## Adding New Features

### Add a New Card

1. Create `NewCard.tsx` in `/components/cards/`
2. Use pattern:
   ```tsx
   export function NewCard() {
     const { data, isLoading, params } = useScoreAnalytics();
     if (isLoading) return <LoadingState />;
     if (!data) return <EmptyState />;
     return <NewChart data={data.something} />;
   }
   ```
3. Add to `ScoreAnalyticsDashboard.tsx`

### Add a New Chart Type

1. Create `NewChart.tsx` in `/components/charts/`
2. Make it pure presentation (props only, no context)
3. Use in a card component

### Add a New Transformation

1. Add pure function to `/transformers/scoreAnalyticsTransformers.ts`
2. Call it in `useScoreAnalyticsQuery` hook's `useMemo`
3. Add to return object interface

### Modify Data Structure

1. Update interfaces in `useScoreAnalyticsQuery.ts`
2. Update transformation logic in `useMemo`
3. Update consuming cards as needed

## Common Patterns

### Handling Single vs Two-Score Mode

```tsx
const { data, params } = useScoreAnalytics();
const { metadata } = data;
const { mode } = metadata;

if (mode === "single") {
  // Show single score UI
} else {
  // Show two-score UI with tabs
}
```

### Handling Different Data Types

```tsx
const { metadata } = data;
const { dataType } = metadata;

if (dataType === "NUMERIC") {
  return <NumericChart />;
} else if (dataType === "BOOLEAN") {
  return <BooleanChart />;
} else {
  return <CategoricalChart />;
}
```

### Using Colors from Provider

```tsx
const { colors } = useScoreAnalytics();

if (isSingleScoreColors(colors)) {
  // Use colors.score
} else {
  // Use colors.score1 and colors.score2
}
```

## File Locations Reference

**Page**: `/web/src/pages/project/[projectId]/scores/analytics.tsx`

**Utilities**:
- Color scales: `/web/src/features/scores/lib/color-scales.ts`
- Statistics utils: `/web/src/features/scores/lib/statistics-utils.ts`
- Heatmap utils: `/web/src/features/scores/lib/heatmap-utils.ts`
- Time series gap filling: `/web/src/utils/fill-time-series-gaps.ts`

**API**:
- tRPC route: `/web/src/server/api/routers/scores.ts`
- Backend: `/packages/shared/src/server/repositories/score-analytics.ts`

## Performance Considerations

- **Transform Once**: All transformations happen in the hook, not on every render
- **Memoization**: All transformations use `useMemo` with proper dependencies
- **Context**: Prevents prop drilling and re-renders in unrelated components
- **Time Series Gap Filling**: Happens once in hook, not per chart

## Testing

Backend tests: `/web/src/__tests__/async/score-comparison-analytics.servertest.ts`

Test coverage:
- All data types (NUMERIC, BOOLEAN, CATEGORICAL)
- All modes (single, two-score, same-score-twice)
- Edge cases (empty data, missing bins, timezone handling)
- Statistical calculations (correlation, Cohen's Kappa, F1, etc.)

## Troubleshooting

**Cards not updating**: Check that `useScoreAnalytics()` is called inside `<ScoreAnalyticsProvider>`

**Data transformation issues**: Check transformers in `useScoreAnalyticsQuery.ts` - all transformations should happen there

**Type errors**: Check interfaces in `useScoreAnalyticsQuery.ts` and `ScoreAnalyticsProvider.tsx`

**Color issues**: Check `color-scales.ts` and color assignment in `ScoreAnalyticsProvider.tsx`

**Category collisions in timeline**: Check namespace logic in `useScoreAnalyticsQuery.ts` (lines 376-412)
