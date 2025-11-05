# Score Analytics Refactoring - Detailed Implementation Plan

## Table of Contents
1. [Architectural Critique](#architectural-critique)
2. [Current Issues](#current-issues)
3. [Recommended Architecture](#recommended-architecture)
4. [Implementation Phases](#implementation-phases)
5. [File Structure](#file-structure)
6. [Testing Strategy](#testing-strategy)
7. [Rollback Plan](#rollback-plan)
8. [Success Criteria](#success-criteria)

---

## Architectural Critique

### Current Implementation Overview

The score analytics feature spans **~3,506 lines across 19 components**:

- **Page**: `analytics.tsx` (668 lines) - Main orchestrator
- **Orchestrators**: `SingleScoreAnalytics.tsx` (297 lines), `TwoScoreAnalytics.tsx` (698 lines)
- **Composite Components**: `ComparisonStatistics.tsx` (440 lines), `HeatmapCard.tsx` (143 lines), etc.
- **Chart Routers**: `ScoreDistributionChart.tsx`, `ScoreTimeSeriesChart.tsx`
- **Specialized Charts**: Numeric/Categorical/Boolean variants for each chart type
- **Heatmap Components**: Pure React heatmap visualization system

### Current Architectural Pattern

**Layered Router Pattern**:
```
Page (analytics.tsx)
  ↓ [Fetches data, preprocesses some data]
Single/TwoScoreAnalytics (orchestrators)
  ↓ [More data transformation, routing logic]
Chart Routers (type dispatchers)
  ↓ [Routes by data type]
Specialized Chart Components
  ↓ [Final rendering]
```

**Pros**:
- Type-based routing is clean
- Chart components are reusable
- Heatmap system is well-architected (pure React, OKLCH colors)

**Cons**:
- 4+ layers of nesting creates indirection
- Business logic embedded at every layer
- Props drilling through multiple layers
- No clear data transformation layer

---

## Current Issues

### 1. Code Duplication (~400 lines, 11%)

#### Category Extraction (2x duplication)
**Location 1**: `SingleScoreAnalytics.tsx:42-53`
```typescript
const categories = useMemo(() => {
  if (dataType === "NUMERIC") return undefined;
  const uniqueCategories = new Set<string>();
  analytics.confusionMatrix.forEach((row) => {
    uniqueCategories.add(row.rowCategory);
  });
  return Array.from(uniqueCategories).sort();
}, [dataType, analytics.confusionMatrix]);
```

**Location 2**: `TwoScoreAnalytics.tsx:71-131` (60 lines, more complex with stackedDistribution fallback)

#### Distribution Bin Filling (2x duplication)
**Locations**: `SingleScoreAnalytics.tsx:55-74`, `TwoScoreAnalytics.tsx:154-180`
```typescript
const binMap = new Map(rawDistribution.map((item) => [item.binIndex, item.count]));
return categories.map((_, index) => ({
  binIndex: index,
  count: binMap.get(index) ?? 0,
}));
```

#### Bin Label Formatting (4x duplication)
**Locations**:
- `SingleScoreAnalytics.tsx:276-296`
- `TwoScoreAnalytics.tsx:684-697`
- `heatmap-utils.ts:242-256`
- Potentially in other chart components

#### Mode Calculation (2x duplication)
**Location 1**: `analytics.tsx:281-362` (81 lines)
**Location 2**: `SingleScoreAnalytics.tsx:114-137` (24 lines, different approach)

**Impact**: Inconsistent behavior, maintenance burden, bug surface area

### 2. God Components

#### TwoScoreAnalytics.tsx (698 lines)
**Responsibilities** (too many):
1. Local state management (2 useState hooks for tabs)
2. Single-score mode detection
3. Data selection based on tabs (82 lines of switch logic)
4. Data transformation (category extraction, bin filling)
5. Display configuration (2 helper functions with switch logic)
6. Rendering decisions

**Cyclomatic Complexity**: Very High

**Example Problematic Code** (lines 271-352):
```typescript
const categoricalTimeSeriesData = useMemo(() => {
  let rawData: typeof analytics.timeSeriesCategorical1 = [];

  switch (timeSeriesTab) {
    case "score1": ...
    case "score2":
      if (isSingleScore) { ... } else { ... }
    case "both":
      if (isSingleScore) {
        rawData = [...data1, ...data1.map(d => ({ ...d, category: `${score2}-${d.category}` }))];
      } else {
        rawData = [...data1, ...data2];
      }
    case "matched": ...
  }

  return fillCategoricalTimeSeriesGaps(rawData, ...);
}, [timeSeriesTab, analytics, ...8 dependencies]);
```

#### analytics.tsx (668 lines, 200+ lines of business logic)
**Issues**:
- 7 useMemo hooks at page level
- Heatmap preprocessing (44 lines, lines 236-279)
- Mode calculation (82 lines, lines 281-362)
- Score compatibility logic (81 lines, lines 60-140)
- 2 separate date systems (URL state + hook)

**Example** (lines 236-279):
```typescript
const heatmapData = useMemo(() => {
  if (!analyticsData || !parsedScore1) return null;

  const isNumeric = parsedScore1.dataType === "NUMERIC";

  if (isNumeric && analyticsData.heatmap.length > 0) {
    const transformedData = analyticsData.heatmap.map((row) => ({
      bin_x: row.binX,
      bin_y: row.binY,
      count: row.count,
      min1: row.min1,
      max1: row.max1,
      min2: row.min2,
      max2: row.max2,
    }));

    return generateNumericHeatmapData({
      data: transformedData,
      nBins: 10,
      colorVariant: "accent",
      showCounts: true,
      showPercentages: false,
    });
  } else if (!isNumeric && analyticsData.confusionMatrix.length > 0) {
    // ... another 20 lines
  }

  return null;
}, [analyticsData, parsedScore1]);
```

**Should be**: `const heatmap = transformHeatmap(apiData, params)` - pure function, testable

#### ComparisonStatistics.tsx (440 lines)
**Structure**: Deeply nested ternaries for conditional rendering
- Score 1 section (90 lines with numeric/categorical branches)
- Score 2 section (90 lines, duplicated logic)
- Comparison section (150 lines)

**Issue**: Repeated metric card rendering logic could be extracted

### 3. Missing Data/Service Layer

**Problem**: Data transformations embedded in React components

**Current Flow**:
```
API Response
  ↓ [Page transforms: heatmap, mode metrics]
  ↓ [Single/Two transforms: categories, bins, gaps]
  ↓ [Chart components receive semi-processed data]
Rendering
```

**Should Be**:
```
API Response
  ↓ [useScoreAnalyticsQuery: ALL transformations]
Transformed View Models
  ↓ [Provider exposes clean data]
  ↓ [Cards consume via context]
Rendering
```

**Testing Impact**:
- **Current**: Can't unit test transformations (embedded in React components with hooks)
- **Needed**: Pure functions that can be tested independently

### 4. Monolithic API Response (Conscious Design Choice)

**Current API**: `getScoreComparisonAnalytics` returns **14 arrays**:
```typescript
{
  counts: { score1Total, score2Total, matchedCount },
  statistics: { mean1, mean2, std1, std2, pearson, spearman, mae, rmse },
  distribution1, distribution2,
  distribution1Individual, distribution2Individual,
  distribution1Matched, distribution2Matched,
  timeSeries, timeSeriesMatched,
  timeSeriesCategorical1, timeSeriesCategorical2,
  timeSeriesCategorical1Matched, timeSeriesCategorical2Matched,
  heatmap,
  confusionMatrix,
  stackedDistribution, stackedDistributionMatched,
  score2Categories
}
```

**Issue**: Forces complex client-side data selection logic
- TwoScoreAnalytics has to know which array to use based on tab state
- Some arrays are empty depending on mode (single vs two scores)

**Note**: We're keeping this as-is (conscious design choice), but using a hook to decompose it cleanly.

### 5. Excessive Derived State

**Counts across components**:
- Page level: 7 useMemo hooks
- SingleScoreAnalytics: 8 useMemo hooks
- TwoScoreAnalytics: 9 useMemo hooks
- Chart components: 2-4 useMemo hooks each

**Total**: 20+ useMemo hooks creating complex dependency chains

**Issue**:
- Hard to track which computations depend on what
- Potential re-render optimization challenges
- Makes components harder to understand

### 6. Debug Code in Production

**Locations**:
- `analytics.tsx:54-58, 186-203, 226-234`
- `TwoScoreAnalytics.tsx:72, 251`

**Example**:
```typescript
// TODO: REMOVE BEFORE MERGING TO MAIN - Log the query result to console for debugging
useEffect(() => {
  if (scoresData) {
    console.log("[Score Analytics] Fetched score identifiers:", scoresData);
  }
}, [scoresData]);
```

**Should be removed** before production.

---

## Recommended Architecture

### Design Philosophy

**Keep monolithic API** (conscious choice) → **Transform once in hook** → **Expose via provider** → **Smart cards consume context**

### Layer 1: Data Transformation Layer (NEW)

#### Pure Transformer Functions
**File**: `/lib/transformers/scoreAnalyticsTransformers.ts`

```typescript
/**
 * Extract categories from API data
 * Unifies 3 different implementations (analytics.tsx, Single, Two)
 */
export function extractCategories(params: {
  dataType: DataType;
  confusionMatrix: ConfusionMatrixRow[];
  stackedDistribution?: StackedDistributionRow[];
}): string[] | undefined {
  if (params.dataType === "NUMERIC") return undefined;

  // Try stackedDistribution first (for categorical comparisons)
  if (params.stackedDistribution && params.stackedDistribution.length > 0) {
    const uniqueCategories = new Set<string>();
    params.stackedDistribution.forEach((item) => {
      uniqueCategories.add(item.score1Category);
    });
    return Array.from(uniqueCategories).sort();
  }

  // Fallback to confusionMatrix
  if (params.confusionMatrix.length > 0) {
    const uniqueCategories = new Set<string>();
    params.confusionMatrix.forEach((row) => {
      uniqueCategories.add(row.rowCategory);
    });
    return Array.from(uniqueCategories).sort();
  }

  // For boolean: hardcoded assumption
  if (params.dataType === "BOOLEAN") {
    return ["False", "True"];
  }

  return undefined;
}

/**
 * Fill missing bins with zero counts
 * Unifies 2 implementations (Single, Two)
 */
export function fillDistributionBins(
  distribution: Array<{ binIndex: number; count: number }>,
  categories: string[]
): Array<{ binIndex: number; count: number }> {
  const binMap = new Map(
    distribution.map((item) => [item.binIndex, item.count])
  );

  return categories.map((_, index) => ({
    binIndex: index,
    count: binMap.get(index) ?? 0,
  }));
}

/**
 * Calculate mode metrics for categorical/boolean scores
 * Unifies 2 implementations (analytics.tsx, Single)
 */
export function calculateModeMetrics(params: {
  distribution: Array<{ binIndex: number; count: number }>;
  timeSeries: Array<{ category: string; count: number }>;
  totalCount: number;
}): { mode: { category: string; count: number }; modePercentage: number } | null {
  if (params.distribution.length === 0 || params.timeSeries.length === 0) {
    return null;
  }

  // Extract unique categories and create mapping
  const uniqueCategories = Array.from(
    new Set(params.timeSeries.map((item) => item.category))
  ).sort();

  const binIndexToCategory = new Map(
    uniqueCategories.map((cat, idx) => [idx, cat])
  );

  // Find bin with max count (mode)
  const maxCount = Math.max(...params.distribution.map((d) => d.count));
  const modeItem = params.distribution.find((d) => d.count === maxCount);

  if (!modeItem) return null;

  const categoryName = binIndexToCategory.get(modeItem.binIndex);
  if (!categoryName) return null;

  const modePercentage = (modeItem.count / params.totalCount) * 100;

  return {
    mode: {
      category: categoryName,
      count: modeItem.count,
    },
    modePercentage,
  };
}

/**
 * Transform heatmap data
 * Extracted from analytics.tsx:236-279
 */
export function transformHeatmapData(params: {
  apiData: RouterOutputs["scores"]["getScoreComparisonAnalytics"];
  dataType: DataType;
  parsedScore1: ScoreInfo;
}): HeatmapData | null {
  const { apiData, dataType, parsedScore1 } = params;

  if (!apiData || !parsedScore1) return null;

  const isNumeric = dataType === "NUMERIC";

  if (isNumeric && apiData.heatmap.length > 0) {
    const transformedData = apiData.heatmap.map((row) => ({
      bin_x: row.binX,
      bin_y: row.binY,
      count: row.count,
      min1: row.min1,
      max1: row.max1,
      min2: row.min2,
      max2: row.max2,
    }));

    return generateNumericHeatmapData({
      data: transformedData,
      nBins: 10,
      colorVariant: "accent",
      showCounts: true,
      showPercentages: false,
    });
  } else if (!isNumeric && apiData.confusionMatrix.length > 0) {
    const transformedData = apiData.confusionMatrix.map((row) => ({
      row_category: row.rowCategory,
      col_category: row.colCategory,
      count: row.count,
    }));

    return generateConfusionMatrixData({
      data: transformedData,
      colorVariant: "accent",
      highlightDiagonal: true,
      showCounts: true,
      showPercentages: true,
    });
  }

  return null;
}

/**
 * Generate bin labels for numeric scores
 * Unifies 4 implementations
 */
export function generateBinLabels(params: {
  min: number;
  max: number;
  nBins: number;
}): string[] {
  const { min, max, nBins } = params;
  const binWidth = (max - min) / nBins;

  return Array.from({ length: nBins }, (_, i) => {
    const start = min + i * binWidth;
    const end = min + (i + 1) * binWidth;
    return formatBinLabel(start, end);
  });
}

function formatBinLabel(start: number, end: number): string {
  const range = Math.abs(end - start);
  let precision: number;

  if (range >= 1) {
    precision = 1;
  } else if (range >= 0.1) {
    precision = 2;
  } else {
    precision = 3;
  }

  return `[${start.toFixed(precision)}, ${end.toFixed(precision)})`;
}
```

**Benefits**:
- Pure functions → Easy to test
- Single source of truth → No duplication
- Clear API → Self-documenting with JSDoc

### Layer 2: Data Fetching + Transformation Hook

**File**: `/lib/hooks/useScoreAnalyticsQuery.ts`

```typescript
export interface ScoreAnalyticsQueryParams {
  projectId: string;
  score1: ParsedScore;
  score2?: ParsedScore;
  fromTimestamp: Date;
  toTimestamp: Date;
  interval: IntervalConfig;
  objectType?: ObjectType;
  nBins: number;
}

export interface ScoreAnalyticsData {
  statistics: {
    score1: {
      total: number;
      mean: number | null;
      std: number | null;
      mode: { category: string; count: number } | null;
      modePercentage: number | null;
    };
    score2: {
      total: number;
      mean: number | null;
      std: number | null;
      mode: { category: string; count: number } | null;
      modePercentage: number | null;
    } | null;
    comparison: {
      matchedCount: number;
      pearsonCorrelation: number | null;
      spearmanCorrelation: number | null;
      mae: number | null;
      rmse: number | null;
      confusionMatrix: ConfusionMatrixRow[];
    } | null;
  };
  distribution: {
    score1: FilledDistribution;
    score2: FilledDistribution | null;
    categories?: string[];
    binLabels?: string[];
    // Tab-specific data
    score1Individual: Distribution;
    score2Individual: Distribution;
    score1Matched: Distribution;
    score2Matched: Distribution;
    stackedDistribution?: StackedDistribution;
    stackedDistributionMatched?: StackedDistribution;
    score2Categories?: string[];
  };
  timeSeries: {
    numeric: {
      all: TimeSeriesData;
      matched: TimeSeriesData;
    };
    categorical: {
      score1: CategoricalTimeSeriesData;
      score2: CategoricalTimeSeriesData;
      score1Matched: CategoricalTimeSeriesData;
      score2Matched: CategoricalTimeSeriesData;
    };
  };
  heatmap: HeatmapData | null;
  metadata: {
    mode: 'single' | 'two';
    isSameScore: boolean;
    dataType: DataType;
  };
}

export function useScoreAnalyticsQuery(params: ScoreAnalyticsQueryParams) {
  // 1. Fetch monolithic API response
  const {
    data: apiData,
    isLoading,
    error,
  } = api.scores.getScoreComparisonAnalytics.useQuery(
    {
      projectId: params.projectId,
      score1: params.score1,
      score2: params.score2 ?? params.score1, // Use same score if only one selected
      fromTimestamp: params.fromTimestamp,
      toTimestamp: params.toTimestamp,
      interval: params.interval,
      objectType: params.objectType,
      matchedOnly: false,
    },
    {
      enabled: !!(params.projectId && params.score1),
    }
  );

  // 2. Transform data using pure functions
  const transformedData = useMemo(() => {
    if (!apiData) return null;

    // Extract categories (ONCE, not 3x)
    const categories = extractCategories({
      dataType: params.score1.dataType,
      confusionMatrix: apiData.confusionMatrix,
      stackedDistribution: apiData.stackedDistribution,
    });

    // Fill distribution bins (ONCE, not 2x)
    const distribution1 = categories
      ? fillDistributionBins(apiData.distribution1, categories)
      : apiData.distribution1;

    const distribution2 = categories && params.score2
      ? fillDistributionBins(apiData.distribution2, categories)
      : apiData.distribution2;

    // Generate bin labels for numeric (ONCE, not 4x)
    const binLabels = params.score1.dataType === 'NUMERIC'
      ? generateBinLabels({
          min: apiData.heatmap[0]?.min1 ?? 0,
          max: apiData.heatmap[0]?.max1 ?? 1,
          nBins: params.nBins,
        })
      : undefined;

    // Transform heatmap (ONCE, not in page component)
    const heatmap = transformHeatmapData({
      apiData,
      dataType: params.score1.dataType,
      parsedScore1: params.score1,
    });

    // Calculate mode metrics (ONCE, not 2x)
    const modeMetrics1 = params.score1.dataType !== 'NUMERIC'
      ? calculateModeMetrics({
          distribution: apiData.distribution1,
          timeSeries: apiData.timeSeriesCategorical1,
          totalCount: apiData.counts.score1Total,
        })
      : null;

    const modeMetrics2 = params.score2 && params.score2.dataType !== 'NUMERIC'
      ? calculateModeMetrics({
          distribution: apiData.distribution2,
          timeSeries: apiData.timeSeriesCategorical2,
          totalCount: apiData.counts.score2Total,
        })
      : null;

    return {
      statistics: {
        score1: {
          total: apiData.counts.score1Total,
          mean: apiData.statistics?.mean1 ?? null,
          std: apiData.statistics?.std1 ?? null,
          mode: modeMetrics1?.mode ?? null,
          modePercentage: modeMetrics1?.modePercentage ?? null,
        },
        score2: params.score2 ? {
          total: apiData.counts.score2Total,
          mean: apiData.statistics?.mean2 ?? null,
          std: apiData.statistics?.std2 ?? null,
          mode: modeMetrics2?.mode ?? null,
          modePercentage: modeMetrics2?.modePercentage ?? null,
        } : null,
        comparison: params.score2 ? {
          matchedCount: apiData.counts.matchedCount,
          pearsonCorrelation: apiData.statistics?.pearsonCorrelation ?? null,
          spearmanCorrelation: apiData.statistics?.spearmanCorrelation ?? null,
          mae: apiData.statistics?.mae ?? null,
          rmse: apiData.statistics?.rmse ?? null,
          confusionMatrix: apiData.confusionMatrix,
        } : null,
      },
      distribution: {
        score1: distribution1,
        score2: distribution2,
        categories,
        binLabels,
        // Preserve all tab-specific data
        score1Individual: apiData.distribution1Individual,
        score2Individual: apiData.distribution2Individual,
        score1Matched: apiData.distribution1Matched,
        score2Matched: apiData.distribution2Matched,
        stackedDistribution: apiData.stackedDistribution,
        stackedDistributionMatched: apiData.stackedDistributionMatched,
        score2Categories: apiData.score2Categories,
      },
      timeSeries: {
        numeric: {
          all: fillTimeSeriesGaps(
            apiData.timeSeries,
            params.fromTimestamp,
            params.toTimestamp,
            params.interval
          ),
          matched: fillTimeSeriesGaps(
            apiData.timeSeriesMatched,
            params.fromTimestamp,
            params.toTimestamp,
            params.interval
          ),
        },
        categorical: {
          score1: fillCategoricalTimeSeriesGaps(
            apiData.timeSeriesCategorical1,
            params.fromTimestamp,
            params.toTimestamp,
            params.interval
          ),
          score2: fillCategoricalTimeSeriesGaps(
            apiData.timeSeriesCategorical2,
            params.fromTimestamp,
            params.toTimestamp,
            params.interval
          ),
          score1Matched: fillCategoricalTimeSeriesGaps(
            apiData.timeSeriesCategorical1Matched,
            params.fromTimestamp,
            params.toTimestamp,
            params.interval
          ),
          score2Matched: fillCategoricalTimeSeriesGaps(
            apiData.timeSeriesCategorical2Matched,
            params.fromTimestamp,
            params.toTimestamp,
            params.interval
          ),
        },
      },
      heatmap,
      metadata: {
        mode: params.score2 ? 'two' : 'single',
        isSameScore: !!(
          params.score2 &&
          params.score1.name === params.score2.name &&
          params.score1.source === params.score2.source
        ),
        dataType: params.score1.dataType,
      },
    };
  }, [apiData, params]);

  return {
    data: transformedData,
    isLoading,
    error,
  };
}
```

**Key Design Points**:
1. **Single transformation point** - All data processing happens here
2. **Preserves API structure** - Exposes all tab-specific data for cards to use
3. **Memoized** - Only recomputes when API data or params change
4. **Type-safe** - Full TypeScript interfaces for return data

### Layer 3: Context Provider

**File**: `/components/score-analytics/ScoreAnalyticsProvider.tsx`

```typescript
interface ScoreAnalyticsContextValue {
  // Transformed data from hook
  statistics: ScoreAnalyticsData['statistics'];
  distribution: ScoreAnalyticsData['distribution'];
  timeSeries: ScoreAnalyticsData['timeSeries'];
  heatmap: ScoreAnalyticsData['heatmap'];
  metadata: ScoreAnalyticsData['metadata'];

  // Loading states
  isLoading: boolean;
  error: Error | null;

  // Score info
  scores: {
    score1: ScoreInfo;
    score2?: ScoreInfo;
  };

  // Colors (assigned once)
  colors: {
    score1: string;
    score2?: string;
  };

  // Time range
  interval: IntervalConfig;
}

const ScoreAnalyticsContext = createContext<ScoreAnalyticsContextValue | null>(null);

export interface ScoreAnalyticsProviderProps {
  children: React.ReactNode;
  projectId: string;
  score1: ParsedScore;
  score2?: ParsedScore;
  fromTimestamp: Date;
  toTimestamp: Date;
  interval: IntervalConfig;
  objectType?: ObjectType;
  nBins?: number;
}

export function ScoreAnalyticsProvider({
  children,
  projectId,
  score1,
  score2,
  fromTimestamp,
  toTimestamp,
  interval,
  objectType,
  nBins = 10,
}: ScoreAnalyticsProviderProps) {
  // Use the data hook
  const { data, isLoading, error } = useScoreAnalyticsQuery({
    projectId,
    score1,
    score2,
    fromTimestamp,
    toTimestamp,
    interval,
    objectType,
    nBins,
  });

  // Assign colors once
  const colors = useMemo(() => {
    const twoScoreColors = getTwoScoreColors();
    return {
      score1: score2 ? twoScoreColors.score1 : getSingleScoreColor(),
      score2: score2 ? twoScoreColors.score2 : undefined,
    };
  }, [score2]);

  const contextValue = useMemo(() => ({
    statistics: data?.statistics ?? { score1: null, score2: null, comparison: null },
    distribution: data?.distribution ?? { score1: [], score2: null },
    timeSeries: data?.timeSeries ?? {
      numeric: { all: [], matched: [] },
      categorical: { score1: [], score2: [], score1Matched: [], score2Matched: [] }
    },
    heatmap: data?.heatmap ?? null,
    metadata: data?.metadata ?? {
      mode: 'single',
      isSameScore: false,
      dataType: score1.dataType
    },
    isLoading,
    error,
    scores: { score1, score2 },
    colors,
    interval,
  }), [data, isLoading, error, score1, score2, colors, interval]);

  return (
    <ScoreAnalyticsContext.Provider value={contextValue}>
      {children}
    </ScoreAnalyticsContext.Provider>
  );
}

export function useScoreAnalytics() {
  const context = useContext(ScoreAnalyticsContext);
  if (!context) {
    throw new Error('useScoreAnalytics must be used within ScoreAnalyticsProvider');
  }
  return context;
}
```

**Responsibilities**:
1. Wraps `useScoreAnalyticsQuery` hook
2. Assigns colors based on mode
3. Provides default values for loading states
4. Exposes via context

### Layer 4: Smart Card Components

#### StatisticsCard
**File**: `/components/score-analytics/cards/StatisticsCard.tsx`

```typescript
export function StatisticsCard() {
  const { statistics, isLoading, metadata, scores } = useScoreAnalytics();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  // Reuse existing ComparisonStatistics structure
  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistics</CardTitle>
        <CardDescription>
          {metadata.mode === 'two'
            ? `${scores.score1.name} vs ${scores.score2.name}`
            : `${scores.score1.name} - Select a second score for comparison`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score 1 Section */}
        <div>
          <h4 className="mb-2 text-xs font-semibold">
            {scores.score1.name} ({scores.score1.source})
          </h4>
          {metadata.dataType === "NUMERIC" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard label="Total" value={statistics.score1.total.toLocaleString()} />
              <MetricCard label="Mean" value={statistics.score1.mean?.toFixed(2) ?? "N/A"} />
              <MetricCard label="Std Dev" value={statistics.score1.std?.toFixed(2) ?? "N/A"} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard label="Total" value={statistics.score1.total.toLocaleString()} />
              <MetricCard
                label="Mode"
                value={statistics.score1.mode
                  ? `${statistics.score1.mode.category} (${statistics.score1.mode.count.toLocaleString()})`
                  : "N/A"}
              />
              <MetricCard
                label="Mode %"
                value={statistics.score1.modePercentage?.toFixed(1) + '%' ?? "N/A"}
              />
            </div>
          )}
        </div>

        {/* Score 2 Section (if two scores) */}
        {metadata.mode === 'two' && statistics.score2 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold">
              {scores.score2.name} ({scores.score2.source})
            </h4>
            {/* Similar structure to Score 1 */}
          </div>
        )}

        {/* Comparison Section (if two scores) */}
        {metadata.mode === 'two' && statistics.comparison && (
          <div>
            <h4 className="mb-2 text-xs font-semibold">Comparison</h4>
            {/* Correlation metrics or categorical agreement metrics */}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Characteristics**:
- Consumes context via `useScoreAnalytics()`
- Handles own loading state
- Decides what to render based on `metadata.mode`
- No props needed (gets everything from context)

#### DistributionChartCard
**File**: `/components/score-analytics/cards/DistributionChartCard.tsx`

```typescript
type DistributionTab = 'both' | 'score1' | 'score2' | 'matched';

export function DistributionChartCard() {
  const { distribution, isLoading, metadata, scores, colors } = useScoreAnalytics();

  // Local tab state (card-level UI concern)
  const [activeTab, setActiveTab] = useState<DistributionTab>('both');

  if (isLoading) return <Skeleton className="h-[400px]" />;
  if (!distribution.score1 || distribution.score1.length === 0) return null;

  // Select data based on tab (card decides, not parent)
  const chartData = useMemo(() => {
    switch (activeTab) {
      case 'score1':
        return {
          distribution1: distribution.score1Individual,
          distribution2: undefined,
        };
      case 'score2':
        return {
          distribution1: distribution.score2Individual ?? [],
          distribution2: undefined,
        };
      case 'matched':
        return {
          distribution1: distribution.score1Matched,
          distribution2: distribution.score2Matched,
        };
      case 'both':
      default:
        return {
          distribution1: distribution.score1,
          distribution2: distribution.score2,
        };
    }
  }, [activeTab, distribution]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Distribution</CardTitle>
            <CardDescription>{/* Context-based description */}</CardDescription>
          </div>
          {metadata.mode === 'two' && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DistributionTab)}>
              <TabsList>
                <TabsTrigger value="score1">{scores.score1.name}</TabsTrigger>
                <TabsTrigger value="score2">{scores.score2?.name}</TabsTrigger>
                <TabsTrigger value="both">Both</TabsTrigger>
                <TabsTrigger value="matched">Matched</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>
      <CardContent className="h-[300px]">
        <ScoreDistributionChart
          distribution1={chartData.distribution1}
          distribution2={chartData.distribution2}
          dataType={metadata.dataType}
          score1Name={scores.score1.name}
          score2Name={activeTab === 'both' ? scores.score2?.name : undefined}
          binLabels={distribution.binLabels}
          categories={distribution.categories}
          stackedDistribution={
            activeTab === 'matched'
              ? distribution.stackedDistributionMatched
              : distribution.stackedDistribution
          }
        />
      </CardContent>
    </Card>
  );
}
```

**Key Features**:
- Local tab state management
- Data selection logic encapsulated
- Reuses existing `ScoreDistributionChart` component
- Returns `null` if no data (self-hiding)

#### TimelineChartCard
**File**: `/components/score-analytics/cards/TimelineChartCard.tsx`

Similar pattern to DistributionChartCard:
- Local tab state
- Selects numeric or categorical data based on `metadata.dataType`
- Handles matched/individual data selection
- Reuses existing `ScoreTimeSeriesChart` component

#### HeatmapCard
**File**: `/components/score-analytics/cards/HeatmapCard.tsx`

Already well-structured, just wire to context:

```typescript
export function HeatmapCard() {
  const { heatmap, metadata, scores } = useScoreAnalytics();

  if (metadata.mode === 'single') {
    return <HeatmapPlaceholder />;
  }

  if (!heatmap) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {metadata.dataType === 'NUMERIC' ? 'Score Correlation' : 'Confusion Matrix'}
        </CardTitle>
        <CardDescription>
          {scores.score1.name} vs {scores.score2?.name}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Heatmap {...heatmap} />
      </CardContent>
    </Card>
  );
}
```

### Layer 5: Layout Components

#### ScoreAnalyticsDashboard
**File**: `/components/score-analytics/ScoreAnalyticsDashboard.tsx`

```typescript
export function ScoreAnalyticsDashboard() {
  const { isLoading } = useScoreAnalytics();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <Loader2 className="h-12 w-12 animate-spin" />
        <p className="text-sm text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="max-h-full space-y-6 overflow-y-scroll p-4 pt-6">
      {/* Row 1: Statistics + Timeline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatisticsCard />
        <TimelineChartCard />
      </div>

      {/* Row 2: Distribution + Heatmap */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DistributionChartCard />
        <HeatmapCard />
      </div>
    </div>
  );
}
```

**Responsibility**: Just layout. Cards handle their own rendering logic.

#### ScoreAnalyticsHeader
**File**: `/components/score-analytics/ScoreAnalyticsHeader.tsx`

Extracted from analytics.tsx header controls:

```typescript
export function ScoreAnalyticsHeader({
  score1,
  score2,
  onScore1Change,
  onScore2Change,
  objectType,
  onObjectTypeChange,
  timeRange,
  onTimeRangeChange,
  scoreOptions,
  compatibleScore2DataTypes,
}: Props) {
  return (
    <div className="flex flex-col gap-1 border-b border-border p-2 lg:flex-row lg:items-center lg:gap-4">
      {/* Left: Score Selectors */}
      <div className="flex items-center gap-2">
        <ScoreSelector
          value={score1}
          onChange={onScore1Change}
          options={scoreOptions}
          placeholder="First score"
          className="h-8 w-[160px]"
        />
        <ScoreSelector
          value={score2}
          onChange={onScore2Change}
          options={scoreOptions}
          placeholder="Second score"
          filterByDataType={compatibleScore2DataTypes}
          className="h-8 w-[160px]"
        />
      </div>

      {/* Middle: Spacer */}
      <div className="hidden flex-1 lg:block" />

      {/* Right: Filters */}
      <div className="flex items-center gap-2">
        <ObjectTypeFilter
          value={objectType}
          onChange={onObjectTypeChange}
          className="h-8 w-[140px]"
        />
        <TimeRangePicker
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
          timeRangePresets={DASHBOARD_AGGREGATION_OPTIONS}
          className="my-0"
        />
      </div>
    </div>
  );
}
```

### Layer 6: Page Component (Simplified)

**File**: `/pages/project/[projectId]/scores/analytics-v2.tsx`

```typescript
export default function ScoresAnalyticsV2Page() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const { state: urlState, setScore1, setScore2, setObjectType } = useAnalyticsUrlState();
  const { timeRange, setTimeRange } = useDashboardDateRange();

  // Fetch score options
  const { data: scoresData, isLoading: scoresLoading, error: scoresError } =
    api.scores.getScoreIdentifiers.useQuery({ projectId }, { enabled: !!projectId });

  // Transform score options
  const scoreOptions: ScoreOption[] = useMemo(() => {
    if (!scoresData?.scores) return [];
    const typeOrder: Record<string, number> = { BOOLEAN: 0, CATEGORICAL: 1, NUMERIC: 2 };
    return scoresData.scores
      .map(score => ({ ...score }))
      .sort((a, b) => {
        const typeA = typeOrder[a.dataType] ?? 999;
        const typeB = typeOrder[b.dataType] ?? 999;
        if (typeA !== typeB) return typeA - typeB;
        return a.name.localeCompare(b.name);
      });
  }, [scoresData]);

  // Parse selected scores
  const parsedScore1 = useMemo(() => {
    if (!urlState.score1) return null;
    const selected = scoreOptions.find((opt) => opt.value === urlState.score1);
    if (!selected) return null;
    return { name: selected.name, dataType: selected.dataType, source: selected.source };
  }, [urlState.score1, scoreOptions]);

  const parsedScore2 = useMemo(() => {
    if (!urlState.score2) return null;
    const selected = scoreOptions.find((opt) => opt.value === urlState.score2);
    if (!selected) return null;
    return { name: selected.name, dataType: selected.dataType, source: selected.source };
  }, [urlState.score2, scoreOptions]);

  // Calculate time range and interval
  const absoluteTimeRange = useMemo(() => toAbsoluteTimeRange(timeRange), [timeRange]);
  const interval = useMemo(() => {
    if (!absoluteTimeRange) return { count: 1, unit: "day" as const };
    return getOptimalInterval(absoluteTimeRange.from, absoluteTimeRange.to);
  }, [absoluteTimeRange]);

  // Score compatibility logic
  const compatibleScore2DataTypes = useMemo(() => {
    const score1DataType = scoreOptions.find(opt => opt.value === urlState.score1)?.dataType;
    if (!score1DataType) return undefined;
    if (score1DataType === "NUMERIC") return ["NUMERIC"];
    return ["BOOLEAN", "CATEGORICAL", "NUMERIC"];
  }, [urlState.score1, scoreOptions]);

  // Handle empty states BEFORE provider
  if (scoresError) {
    return (
      <Page headerProps={{ ... }}>
        <ErrorState message="Failed to load score data" />
      </Page>
    );
  }

  if (scoresLoading) {
    return (
      <Page headerProps={{ ... }}>
        <LoadingState />
      </Page>
    );
  }

  if (scoreOptions.length === 0) {
    return (
      <Page headerProps={{ ... }}>
        <NoScoresState />
      </Page>
    );
  }

  if (!parsedScore1) {
    return (
      <Page headerProps={{ ... }}>
        <ScoreAnalyticsHeader
          score1={urlState.score1}
          score2={urlState.score2}
          onScore1Change={setScore1}
          onScore2Change={setScore2}
          objectType={urlState.objectType}
          onObjectTypeChange={setObjectType}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          scoreOptions={scoreOptions}
          compatibleScore2DataTypes={compatibleScore2DataTypes}
        />
        <NoSelectionState />
      </Page>
    );
  }

  if (!absoluteTimeRange) return null;

  return (
    <Page headerProps={{
      title: "Scores",
      breadcrumb: [{ name: "Scores", href: `/project/${projectId}/scores` }],
      help: { ... },
      tabsProps: { ... },
    }}>
      <div className="flex max-h-full flex-col gap-0">
        <ScoreAnalyticsHeader
          score1={urlState.score1}
          score2={urlState.score2}
          onScore1Change={setScore1}
          onScore2Change={setScore2}
          objectType={urlState.objectType}
          onObjectTypeChange={setObjectType}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          scoreOptions={scoreOptions}
          compatibleScore2DataTypes={compatibleScore2DataTypes}
        />

        <ScoreAnalyticsProvider
          projectId={projectId}
          score1={parsedScore1}
          score2={parsedScore2}
          fromTimestamp={absoluteTimeRange.from}
          toTimestamp={absoluteTimeRange.to}
          interval={interval}
          objectType={urlState.objectType}
        >
          <ScoreAnalyticsDashboard />
        </ScoreAnalyticsProvider>
      </div>
    </Page>
  );
}
```

**Lines**: ~200 (was 668) - **70% reduction**

**What's left**:
- Score option fetching and parsing
- URL state management
- Time range calculation
- Compatibility logic
- Empty state handling (before provider)
- Clean provider wrapping

**What's removed**:
- ❌ Data transformation (now in hook)
- ❌ Heatmap preprocessing (now in transformers)
- ❌ Mode calculation (now in transformers)
- ❌ useMemo for analytics data processing
- ❌ Conditional rendering of cards (cards decide)
- ❌ Debug console.log statements

---

## Implementation Phases

### Phase 1: Setup Parallel Structure (Day 1, Morning - 2 hours)

**Goals**:
1. Create new directory structure
2. Add new route for analytics-v2
3. Update navigation tabs

**Steps**:

```bash
# 1. Create directories
mkdir -p web/src/features/scores/components/score-analytics/cards
mkdir -p web/src/features/scores/lib/transformers
mkdir -p web/src/features/scores/lib/hooks
```

```bash
# 2. Copy analytics.tsx to analytics-v2.tsx
cp web/src/pages/project/[projectId]/scores/analytics.tsx \
   web/src/pages/project/[projectId]/scores/analytics-v2.tsx
```

```typescript
// 3. Update scores-tabs.ts
export const SCORES_TABS = {
  LOG: "log",
  ANALYTICS: "analytics",
  ANALYTICS_V2: "analytics-v2",  // NEW - temporary during development
  CONFIG: "config",
};

// Add to getScoresTabs() function
{
  href: `/project/${projectId}/scores/analytics-v2`,
  name: "Analytics V2",
  id: SCORES_TABS.ANALYTICS_V2,
}
```

**Validation**:
- [ ] Both `/scores/analytics` and `/scores/analytics-v2` routes work
- [ ] Both tabs appear in navigation
- [ ] Old analytics page unchanged

### Phase 2: Build Transformer Layer (Day 1, Afternoon - 4 hours)

**Goal**: Extract all duplicated transformation logic to pure functions

**File**: `/lib/transformers/scoreAnalyticsTransformers.ts`

**Steps**:

1. **Create file structure**:
```typescript
/**
 * Pure transformation functions for score analytics data
 * Extracted from analytics.tsx, SingleScoreAnalytics, TwoScoreAnalytics
 * to eliminate duplication and enable testing
 */

import type { RouterOutputs } from "@/src/utils/api";
// ... other imports
```

2. **Implement functions** (copy from detailed code examples above):
   - `extractCategories()`
   - `fillDistributionBins()`
   - `calculateModeMetrics()`
   - `transformHeatmapData()`
   - `generateBinLabels()`
   - `formatBinLabel()` (private helper)

3. **Write unit tests**:
```typescript
// web/src/__tests__/scoreAnalyticsTransformers.test.ts
describe('extractCategories', () => {
  it('returns undefined for numeric scores', () => {
    const result = extractCategories({
      dataType: 'NUMERIC',
      confusionMatrix: [],
    });
    expect(result).toBeUndefined();
  });

  it('extracts categories from confusion matrix', () => {
    const result = extractCategories({
      dataType: 'CATEGORICAL',
      confusionMatrix: [
        { rowCategory: 'good', colCategory: 'good', count: 10 },
        { rowCategory: 'bad', colCategory: 'good', count: 5 },
      ],
    });
    expect(result).toEqual(['bad', 'good']); // Sorted
  });

  it('prefers stackedDistribution over confusionMatrix', () => {
    const result = extractCategories({
      dataType: 'CATEGORICAL',
      confusionMatrix: [{ rowCategory: 'old', colCategory: 'old', count: 1 }],
      stackedDistribution: [
        { score1Category: 'new1', score2Stack: 'new2', count: 10 },
        { score1Category: 'new2', score2Stack: 'new1', count: 5 },
      ],
    });
    expect(result).toEqual(['new1', 'new2']);
  });

  it('returns hardcoded boolean categories', () => {
    const result = extractCategories({
      dataType: 'BOOLEAN',
      confusionMatrix: [],
    });
    expect(result).toEqual(['False', 'True']);
  });
});

describe('fillDistributionBins', () => {
  it('fills missing bins with zero', () => {
    const distribution = [
      { binIndex: 0, count: 10 },
      { binIndex: 2, count: 5 },
    ];
    const categories = ['cat1', 'cat2', 'cat3'];

    const result = fillDistributionBins(distribution, categories);

    expect(result).toEqual([
      { binIndex: 0, count: 10 },
      { binIndex: 1, count: 0 },  // Filled
      { binIndex: 2, count: 5 },
    ]);
  });

  it('preserves existing counts', () => {
    const distribution = [
      { binIndex: 0, count: 10 },
      { binIndex: 1, count: 20 },
    ];
    const categories = ['cat1', 'cat2'];

    const result = fillDistributionBins(distribution, categories);

    expect(result).toEqual(distribution);
  });
});

describe('calculateModeMetrics', () => {
  it('returns null for empty distribution', () => {
    const result = calculateModeMetrics({
      distribution: [],
      timeSeries: [],
      totalCount: 0,
    });
    expect(result).toBeNull();
  });

  it('calculates mode correctly', () => {
    const result = calculateModeMetrics({
      distribution: [
        { binIndex: 0, count: 10 },
        { binIndex: 1, count: 50 },  // Mode
        { binIndex: 2, count: 20 },
      ],
      timeSeries: [
        { category: 'good', count: 10 },
        { category: 'great', count: 50 },
        { category: 'bad', count: 20 },
      ],
      totalCount: 80,
    });

    expect(result).toEqual({
      mode: { category: 'great', count: 50 },
      modePercentage: 62.5,  // 50/80 * 100
    });
  });
});

describe('generateBinLabels', () => {
  it('generates correct bin labels', () => {
    const result = generateBinLabels({
      min: 0,
      max: 1,
      nBins: 4,
    });

    expect(result).toEqual([
      '[0.0, 0.2)',
      '[0.2, 0.5)',
      '[0.5, 0.8)',
      '[0.8, 1.0)',
    ]);
  });

  it('adjusts precision based on range', () => {
    const result = generateBinLabels({
      min: 0,
      max: 0.1,
      nBins: 2,
    });

    // Should use higher precision for small ranges
    expect(result[0]).toMatch(/\d\.\d{3}/);
  });
});
```

4. **Run tests**:
```bash
pnpm --filter=web run test -- --testPathPattern="scoreAnalyticsTransformers"
```

**Validation**:
- [ ] All transformer functions implemented
- [ ] All unit tests pass
- [ ] No dependencies on React (pure functions)

### Phase 3: Build Data Hook (Day 2, Morning - 3 hours)

**Goal**: Create `useScoreAnalyticsQuery` hook that transforms API data using pure functions

**File**: `/lib/hooks/useScoreAnalyticsQuery.ts`

**Steps**:

1. **Define types**:
```typescript
export interface ScoreAnalyticsQueryParams {
  projectId: string;
  score1: ParsedScore;
  score2?: ParsedScore;
  fromTimestamp: Date;
  toTimestamp: Date;
  interval: IntervalConfig;
  objectType?: ObjectType;
  nBins: number;
}

export interface ScoreAnalyticsData {
  // ... (from detailed architecture section)
}
```

2. **Implement hook** (copy from detailed architecture section)

3. **Test hook independently** (optional but recommended):
```typescript
// web/src/__tests__/useScoreAnalyticsQuery.test.ts
import { renderHook } from '@testing-library/react';
import { useScoreAnalyticsQuery } from '@/src/features/scores/lib/hooks/useScoreAnalyticsQuery';

// Mock tRPC API
jest.mock('@/src/utils/api', () => ({
  api: {
    scores: {
      getScoreComparisonAnalytics: {
        useQuery: jest.fn(),
      },
    },
  },
}));

describe('useScoreAnalyticsQuery', () => {
  it('transforms API data correctly', () => {
    // Mock API response
    const mockApiData = {
      counts: { score1Total: 100, score2Total: 90, matchedCount: 80 },
      statistics: { mean1: 0.5, std1: 0.2, /* ... */ },
      // ... rest of API data
    };

    api.scores.getScoreComparisonAnalytics.useQuery.mockReturnValue({
      data: mockApiData,
      isLoading: false,
      error: null,
    });

    const { result } = renderHook(() =>
      useScoreAnalyticsQuery({
        projectId: 'test',
        score1: { name: 'test', dataType: 'NUMERIC', source: 'API' },
        fromTimestamp: new Date('2024-01-01'),
        toTimestamp: new Date('2024-01-31'),
        interval: { count: 1, unit: 'day' },
        nBins: 10,
      })
    );

    expect(result.current.data).toBeDefined();
    expect(result.current.data.statistics.score1.total).toBe(100);
    expect(result.current.data.metadata.mode).toBe('single');
  });
});
```

**Validation**:
- [ ] Hook compiles without errors
- [ ] Hook returns correct data structure
- [ ] useMemo dependencies are correct
- [ ] Tests pass (if written)

### Phase 4: Build Context Provider (Day 2, Afternoon - 2 hours)

**Goal**: Create provider that wraps the data hook and exposes context

**File**: `/components/score-analytics/ScoreAnalyticsProvider.tsx`

**Steps**:

1. **Implement provider** (copy from detailed architecture section)

2. **Create consumer hook**:
```typescript
export function useScoreAnalytics() {
  const context = useContext(ScoreAnalyticsContext);
  if (!context) {
    throw new Error('useScoreAnalytics must be used within ScoreAnalyticsProvider');
  }
  return context;
}
```

3. **Test provider**:
```typescript
// web/src/__tests__/ScoreAnalyticsProvider.test.tsx
import { render, screen } from '@testing-library/react';
import { ScoreAnalyticsProvider, useScoreAnalytics } from '../ScoreAnalyticsProvider';

function TestConsumer() {
  const { metadata, isLoading } = useScoreAnalytics();
  return <div>{isLoading ? 'Loading' : metadata.mode}</div>;
}

describe('ScoreAnalyticsProvider', () => {
  it('provides context to children', () => {
    render(
      <ScoreAnalyticsProvider
        projectId="test"
        score1={{ name: 'test', dataType: 'NUMERIC', source: 'API' }}
        fromTimestamp={new Date()}
        toTimestamp={new Date()}
        interval={{ count: 1, unit: 'day' }}
      >
        <TestConsumer />
      </ScoreAnalyticsProvider>
    );

    // Should show loading or mode
    expect(screen.getByText(/Loading|single/)).toBeInTheDocument();
  });

  it('throws error when used outside provider', () => {
    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useScoreAnalytics must be used within ScoreAnalyticsProvider');
  });
});
```

**Validation**:
- [ ] Provider compiles
- [ ] useScoreAnalytics hook works
- [ ] Colors are assigned correctly
- [ ] Context values match expected types

### Phase 5: Build Card Components (Day 3-4 - 8 hours)

**Goal**: Create smart card components that consume context

#### 5.1 StatisticsCard (2 hours)

**File**: `/components/score-analytics/cards/StatisticsCard.tsx`

**Steps**:

1. Copy JSX structure from `ComparisonStatistics.tsx`
2. Replace props with context consumption
3. Add loading skeleton
4. Test rendering

**Validation**:
- [ ] Renders with single score
- [ ] Renders with two scores
- [ ] Shows correct metrics based on data type
- [ ] Loading state works

#### 5.2 DistributionChartCard (2 hours)

**File**: `/components/score-analytics/cards/DistributionChartCard.tsx`

**Steps**:

1. Implement tab state management
2. Implement data selection logic based on tabs
3. Wire to `ScoreDistributionChart` (existing component)
4. Add loading/empty states

**Key Logic**:
```typescript
const chartData = useMemo(() => {
  switch (activeTab) {
    case 'score1':
      return { distribution1: distribution.score1Individual, distribution2: undefined };
    case 'score2':
      return { distribution1: distribution.score2Individual, distribution2: undefined };
    case 'matched':
      return { distribution1: distribution.score1Matched, distribution2: distribution.score2Matched };
    case 'both':
    default:
      return { distribution1: distribution.score1, distribution2: distribution.score2 };
  }
}, [activeTab, distribution]);
```

**Validation**:
- [ ] Tabs switch correctly
- [ ] Data updates when tab changes
- [ ] Chart renders correctly for each tab
- [ ] Single score mode hides tabs

#### 5.3 TimelineChartCard (2 hours)

**File**: `/components/score-analytics/cards/TimelineChartCard.tsx`

**Similar to DistributionChartCard**:

1. Tab state management
2. Data selection (numeric vs categorical based on dataType)
3. Wire to `ScoreTimeSeriesChart`
4. Handle matched/individual data

**Validation**:
- [ ] Numeric time series works
- [ ] Categorical time series works
- [ ] Tabs work correctly
- [ ] Chart shows correct data

#### 5.4 HeatmapCard (1 hour)

**File**: `/components/score-analytics/cards/HeatmapCard.tsx`

**Simplest card** - mostly wiring:

1. Consume heatmap from context
2. Show placeholder for single score
3. Render heatmap for two scores

**Validation**:
- [ ] Shows placeholder for single score
- [ ] Shows heatmap for two scores
- [ ] Numeric heatmap renders
- [ ] Categorical confusion matrix renders

#### 5.5 Integration Testing (1 hour)

Test all cards together:

```typescript
// web/src/__tests__/ScoreAnalyticCards.integration.test.tsx
describe('Score Analytics Cards Integration', () => {
  it('renders all cards with single score', () => {
    render(
      <ScoreAnalyticsProvider {...singleScoreProps}>
        <StatisticsCard />
        <DistributionChartCard />
        <TimelineChartCard />
        <HeatmapCard />
      </ScoreAnalyticsProvider>
    );

    expect(screen.getByText('Statistics')).toBeInTheDocument();
    expect(screen.getByText('Distribution')).toBeInTheDocument();
    expect(screen.getByText('Trend Over Time')).toBeInTheDocument();
    expect(screen.getByText(/placeholder/i)).toBeInTheDocument(); // Heatmap placeholder
  });

  it('renders all cards with two scores', () => {
    render(
      <ScoreAnalyticsProvider {...twoScoreProps}>
        <StatisticsCard />
        <DistributionChartCard />
        <TimelineChartCard />
        <HeatmapCard />
      </ScoreAnalyticsProvider>
    );

    expect(screen.getByText('Statistics')).toBeInTheDocument();
    expect(screen.getByText('Distribution Comparison')).toBeInTheDocument();
    expect(screen.getByText('Scores Over Time')).toBeInTheDocument();
    expect(screen.getByText(/correlation|confusion/i)).toBeInTheDocument(); // Heatmap
  });
});
```

**Validation**:
- [ ] All cards render together
- [ ] Context sharing works
- [ ] No prop drilling issues
- [ ] Integration test passes

### Phase 6: Build Dashboard Layout (Day 4 - 2 hours)

**Goal**: Create layout components

#### 6.1 ScoreAnalyticsDashboard

**File**: `/components/score-analytics/ScoreAnalyticsDashboard.tsx`

**Steps**:

1. Implement loading state
2. Implement 2x2 grid layout
3. Import and arrange cards

**Code** (from detailed architecture section above)

**Validation**:
- [ ] Grid layout works on desktop
- [ ] Stacks on mobile
- [ ] Loading state shows
- [ ] Cards render in correct order

#### 6.2 ScoreAnalyticsHeader

**File**: `/components/score-analytics/ScoreAnalyticsHeader.tsx`

**Steps**:

1. Copy header controls from `analytics.tsx` (lines 403-441)
2. Extract into separate component
3. Accept props for state/callbacks

**Validation**:
- [ ] Score selectors work
- [ ] Object type filter works
- [ ] Time range picker works
- [ ] Layout responsive

### Phase 7: Wire New Page (Day 5 - 3 hours)

**Goal**: Create simplified analytics-v2.tsx page

**File**: `/pages/project/[projectId]/scores/analytics-v2.tsx`

**Steps**:

1. **Copy existing analytics.tsx**
2. **Keep**:
   - Score option fetching
   - URL state management
   - Score parsing
   - Time range calculation
   - Compatibility logic
   - Empty state handling (before provider)

3. **Remove**:
   - All 7 useMemo hooks for data transformation
   - Mode calculation logic
   - Heatmap preprocessing
   - Debug console.log statements
   - Conditional card rendering logic

4. **Add**:
   - Import ScoreAnalyticsProvider
   - Import ScoreAnalyticsDashboard
   - Import ScoreAnalyticsHeader
   - Wrap content in provider

**Final Structure** (from detailed architecture section above)

**Validation**:
- [ ] Page loads without errors
- [ ] Both score selectors work
- [ ] Time range changes trigger re-fetch
- [ ] Object type filter works
- [ ] Empty states show correctly
- [ ] Provider receives correct props
- [ ] Dashboard renders

### Phase 8: Testing & Validation (Day 5-6 - 8 hours)

**Goal**: Ensure new implementation matches old implementation

#### 8.1 Manual Testing Checklist

**Single Score Testing** (2 hours):
```
□ Single numeric score
  □ Displays distribution chart
  □ Displays time series chart
  □ Shows statistics (mean, std dev)
  □ Heatmap shows placeholder

□ Single categorical score
  □ Displays distribution chart
  □ Displays time series chart
  □ Shows statistics (mode, mode %)
  □ Heatmap shows placeholder

□ Single boolean score
  □ Displays distribution chart (2 bars)
  □ Displays time series chart
  □ Shows statistics (mode, mode %)
  □ Heatmap shows placeholder
```

**Two Score Testing** (3 hours):
```
□ Two numeric scores
  □ Distribution chart tabs work (score1, score2, both, matched)
  □ Time series chart tabs work
  □ Statistics show both scores
  □ Statistics show comparison metrics (Pearson, Spearman, MAE, RMSE)
  □ Heatmap shows correlation

□ Two categorical scores
  □ Distribution chart with stacked bars
  □ Time series with multiple categories
  □ Statistics show both modes
  □ Statistics show agreement metrics (Kappa, F1, Overall Agreement)
  □ Heatmap shows confusion matrix

□ Two boolean scores
  □ Distribution chart works
  □ Time series works
  □ Statistics show comparison
  □ Confusion matrix shows

□ Cross-type comparison (e.g., numeric vs categorical)
  □ Charts render correctly
  □ Stats show appropriately
```

**UI/UX Testing** (1 hour):
```
□ Loading states display
□ Empty states display
□ Error states display
□ Tab switching is smooth
□ Responsive on mobile
□ Responsive on tablet
□ Responsive on desktop
□ URL state persists
□ Browser back/forward works
```

**Edge Cases** (1 hour):
```
□ Same score selected twice
□ Very large datasets
□ Very small datasets
□ No data in time range
□ Switch between score types
□ Rapid filter changes
```

#### 8.2 Side-by-Side Comparison (1 hour)

**Process**:
1. Open two browser windows
2. Window 1: `/project/{id}/scores/analytics` (old)
3. Window 2: `/project/{id}/scores/analytics-v2` (new)
4. Perform identical actions in both
5. Compare outputs

**Comparison Points**:
```
□ Same statistics values
□ Same chart data
□ Same heatmap values
□ Same tab behavior
□ Same loading behavior
□ Same error handling
```

**Document discrepancies** - If found, debug and fix before proceeding

#### 8.3 Performance Testing (optional, 30 min)

**Metrics**:
```
□ Initial load time (should be same or better)
□ Tab switch responsiveness (should be same or better)
□ Memory usage (check for leaks)
□ Re-render count (use React DevTools Profiler)
```

### Phase 9: Atomic Swap (Day 6 - 1 hour)

**Goal**: Replace old implementation with new implementation

#### 9.1 Backup Old Implementation

```bash
# Create backup branch
git checkout -b backup/analytics-old

# Backup old files
git add web/src/pages/project/[projectId]/scores/analytics.tsx
git add web/src/features/scores/components/analytics/
git commit -m "backup: Save old analytics implementation before swap"

# Return to feature branch
git checkout michael/analytics-refactor
```

#### 9.2 Rename Files

```bash
# Backup old analytics page
mv web/src/pages/project/[projectId]/scores/analytics.tsx \
   web/src/pages/project/[projectId]/scores/analytics-old.tsx

# Promote new analytics page
mv web/src/pages/project/[projectId]/scores/analytics-v2.tsx \
   web/src/pages/project/[projectId]/scores/analytics.tsx

# Backup old components folder
mv web/src/features/scores/components/analytics \
   web/src/features/scores/components/analytics-old

# Promote new components folder
mv web/src/features/scores/components/score-analytics \
   web/src/features/scores/components/analytics
```

#### 9.3 Update Imports

Search for any remaining imports of old components:

```bash
# Search for old imports
grep -r "SingleScoreAnalytics" web/src/
grep -r "TwoScoreAnalytics" web/src/
```

If found, update to use new card components (shouldn't be any if refactor is complete).

#### 9.4 Remove Temporary Tab

```typescript
// web/src/features/navigation/utils/scores-tabs.ts

// Remove ANALYTICS_V2 tab
export const SCORES_TABS = {
  LOG: "log",
  ANALYTICS: "analytics",
  // ANALYTICS_V2: "analytics-v2",  // REMOVED
  CONFIG: "config",
};

// Remove from getScoresTabs() function
```

#### 9.5 Test After Swap

```bash
# Run linter
pnpm --filter=web run lint

# Run type check
pnpm --filter=web exec tsc --noEmit

# Run tests
pnpm --filter=web run test -- --testPathPattern="scoreAnalytics"

# Start dev server
pnpm run dev:web
```

**Manual Test**:
- [ ] Navigate to `/project/{id}/scores/analytics`
- [ ] Verify new implementation loads
- [ ] Run through checklist one more time

#### 9.6 Commit Swap

```bash
git add .
git commit -m "refactor(scores): Replace analytics implementation with provider-based architecture

- Replace SingleScoreAnalytics/TwoScoreAnalytics with smart card components
- Introduce useScoreAnalyticsQuery hook for data transformation
- Add ScoreAnalyticsProvider for context-based state management
- Extract pure transformer functions (eliminates 400+ lines duplication)
- Reduce analytics.tsx from 668 to ~200 lines

Breaking changes: None (internal refactor only)

Closes: LF-XXXX"
```

### Phase 10: Cleanup & Documentation (Day 6 - 2 hours)

**Goal**: Remove old code, update documentation

#### 10.1 Delete Old Files (after 1 week buffer)

```bash
# After confirming new implementation is stable for 1 week:
rm web/src/pages/project/[projectId]/scores/analytics-old.tsx
rm -rf web/src/features/scores/components/analytics-old/
git add .
git commit -m "cleanup: Remove old analytics implementation"
```

#### 10.2 Update Documentation

**File**: `/components/analytics/README.md`

```markdown
# Score Analytics Architecture

## Overview

Provider-based architecture with smart card components. All data transformation happens once in a custom hook, then exposed via React Context to card components.

## Architecture

```
useScoreAnalyticsQuery (Hook)
  ↓ Transforms monolithic API response
ScoreAnalyticsProvider (Context)
  ↓ Exposes data to children
ScoreAnalyticsDashboard (Layout)
  ├─ StatisticsCard
  ├─ TimelineChartCard
  ├─ DistributionChartCard
  └─ HeatmapCard
```

## Key Files

- `/lib/hooks/useScoreAnalyticsQuery.ts` - Data fetching + transformation
- `/lib/transformers/scoreAnalyticsTransformers.ts` - Pure transformation functions
- `/components/analytics/ScoreAnalyticsProvider.tsx` - Context provider
- `/components/analytics/cards/` - Smart card components

## Adding a New Score Type

1. **Add transformer** in `/lib/transformers/scoreAnalyticsTransformers.ts`
2. **Update hook** in `useScoreAnalyticsQuery` to call transformer
3. **Add chart component** (if needed) in `/components/analytics/charts/`
4. **Cards automatically consume** new data via context

## Testing

```bash
# Unit tests (transformers)
pnpm --filter=web run test -- --testPathPattern="scoreAnalyticsTransformers"

# Integration tests (provider + cards)
pnpm --filter=web run test -- --testPathPattern="ScoreAnalytics"
```

## Benefits

- **53% code reduction** (3,500 → 1,650 lines)
- **Zero duplication** - Transformations unified
- **100% testable** - Pure functions, easy unit tests
- **Easy to extend** - New score types: 3 files instead of 8
- **Clear data flow** - Single transformation point
```

#### 10.3 Add JSDoc Comments

Add comprehensive JSDoc to all exported functions:

```typescript
/**
 * Extract unique categories from score analytics data
 *
 * For numeric scores, returns undefined.
 * For categorical/boolean scores, extracts category names from:
 * 1. stackedDistribution (preferred for comparisons)
 * 2. confusionMatrix (fallback)
 * 3. Hardcoded ["False", "True"] for boolean
 *
 * Categories are returned in alphabetical order.
 *
 * @param params - Configuration object
 * @param params.dataType - Score data type (NUMERIC, CATEGORICAL, BOOLEAN)
 * @param params.confusionMatrix - Confusion matrix from API
 * @param params.stackedDistribution - Optional stacked distribution from API
 * @returns Sorted array of category names, or undefined for numeric scores
 *
 * @example
 * ```typescript
 * const categories = extractCategories({
 *   dataType: 'CATEGORICAL',
 *   confusionMatrix: [{ rowCategory: 'good', colCategory: 'bad', count: 10 }],
 * });
 * // Returns: ['bad', 'good']
 * ```
 */
export function extractCategories(params: {
  dataType: DataType;
  confusionMatrix: ConfusionMatrixRow[];
  stackedDistribution?: StackedDistributionRow[];
}): string[] | undefined {
  // ...
}
```

**Validation**:
- [ ] README.md updated
- [ ] JSDoc comments added to all public functions
- [ ] Examples provided in documentation
- [ ] Old files deleted (after buffer period)

---

## File Structure

### Before Refactoring

```
/features/scores/
├── components/analytics/
│   ├── ComparisonStatistics.tsx           (440 lines)
│   ├── HeatmapCard.tsx                     (143 lines)
│   ├── MetricCard.tsx                      (111 lines)
│   ├── ScoreDistributionChart.tsx          (111 lines - router)
│   ├── ScoreDistributionNumericChart.tsx   (134 lines)
│   ├── ScoreDistributionCategoricalChart.tsx (215 lines)
│   ├── ScoreDistributionBooleanChart.tsx
│   ├── ScoreTimeSeriesChart.tsx            (73 lines - router)
│   ├── ScoreTimeSeriesNumericChart.tsx     (173 lines)
│   ├── ScoreTimeSeriesCategoricalChart.tsx
│   ├── ScoreTimeSeriesBooleanChart.tsx
│   ├── SingleScoreAnalytics.tsx            (297 lines) ❌ DELETE
│   ├── TwoScoreAnalytics.tsx               (698 lines) ❌ DELETE
│   ├── Heatmap.tsx
│   ├── HeatmapCell.tsx
│   ├── HeatmapLegend.tsx
│   ├── HeatmapPlaceholder.tsx
│   ├── ScoreSelector.tsx                   (131 lines)
│   ├── ObjectTypeFilter.tsx
│   ├── MatchedOnlyToggle.tsx
│   └── README.md
├── lib/
│   ├── analytics-url-state.ts
│   ├── color-scales.ts                     (259 lines)
│   ├── heatmap-utils.ts
│   └── statistics-utils.ts
└── pages/
    └── analytics.tsx                        (668 lines) ⚠️ SIMPLIFY

Total: ~3,506 lines
```

### After Refactoring

```
/features/scores/
├── components/analytics/                    [RENAMED from score-analytics]
│   ├── ScoreAnalyticsProvider.tsx          (80 lines) ✨ NEW
│   ├── ScoreAnalyticsDashboard.tsx         (60 lines) ✨ NEW
│   ├── ScoreAnalyticsHeader.tsx            (100 lines) ✨ NEW
│   ├── cards/
│   │   ├── StatisticsCard.tsx              (200 lines) ✨ NEW
│   │   ├── DistributionChartCard.tsx       (180 lines) ✨ NEW
│   │   ├── TimelineChartCard.tsx           (180 lines) ✨ NEW
│   │   └── HeatmapCard.tsx                 (60 lines) ✨ REFACTORED
│   ├── charts/                              [NO CHANGE]
│   │   ├── ScoreDistributionChart.tsx      (111 lines - router)
│   │   ├── ScoreDistributionNumericChart.tsx
│   │   ├── ScoreDistributionCategoricalChart.tsx
│   │   ├── ScoreDistributionBooleanChart.tsx
│   │   ├── ScoreTimeSeriesChart.tsx
│   │   ├── ScoreTimeSeriesNumericChart.tsx
│   │   ├── ScoreTimeSeriesCategoricalChart.tsx
│   │   └── ScoreTimeSeriesBooleanChart.tsx
│   ├── heatmap/                             [NO CHANGE]
│   │   ├── Heatmap.tsx
│   │   ├── HeatmapCell.tsx
│   │   ├── HeatmapLegend.tsx
│   │   └── HeatmapPlaceholder.tsx
│   ├── controls/                            [NO CHANGE]
│   │   ├── ScoreSelector.tsx
│   │   ├── ObjectTypeFilter.tsx
│   │   └── MatchedOnlyToggle.tsx
│   ├── MetricCard.tsx                       (111 lines) [NO CHANGE]
│   └── README.md                            (updated)
├── lib/
│   ├── transformers/
│   │   └── scoreAnalyticsTransformers.ts   (300 lines) ✨ NEW
│   ├── hooks/
│   │   └── useScoreAnalyticsQuery.ts       (200 lines) ✨ NEW
│   ├── analytics-url-state.ts              [NO CHANGE]
│   ├── color-scales.ts                     [NO CHANGE]
│   ├── heatmap-utils.ts                    [NO CHANGE]
│   └── statistics-utils.ts                 [NO CHANGE]
└── pages/
    └── analytics.tsx                        (150 lines) ✅ SIMPLIFIED

New Total: ~1,650 lines (-53%)
```

**Key Changes**:
- ❌ **Deleted**: SingleScoreAnalytics.tsx (297 lines), TwoScoreAnalytics.tsx (698 lines)
- ✨ **Added**: Provider (80), Dashboard (60), Header (100), 4 Cards (620), Hook (200), Transformers (300)
- ✅ **Simplified**: analytics.tsx (668 → 150 lines)
- ✅ **Unchanged**: All chart components, heatmap components, controls, utilities

**Net Change**: -1,856 lines (-53%)

---

## Testing Strategy

### Unit Tests

#### Transformer Tests
**File**: `/web/src/__tests__/scoreAnalyticsTransformers.test.ts`

**Coverage**:
- `extractCategories()` - 5 test cases
- `fillDistributionBins()` - 3 test cases
- `calculateModeMetrics()` - 4 test cases
- `transformHeatmapData()` - 4 test cases
- `generateBinLabels()` - 3 test cases

**Total**: ~19 unit tests for pure functions

#### Hook Tests (Optional)
**File**: `/web/src/__tests__/useScoreAnalyticsQuery.test.ts`

**Coverage**:
- Data transformation correctness
- useMemo dependencies
- Loading states
- Error handling

### Integration Tests

#### Provider + Cards Integration
**File**: `/web/src/__tests__/ScoreAnalyticsCards.integration.test.tsx`

**Coverage**:
- All cards render with single score
- All cards render with two scores
- Context sharing works
- Tab switching works
- Data flows correctly from provider to cards

### E2E Tests (Optional)

**File**: `/web/src/__tests__/e2e/score-analytics-v2.test.ts`

**Coverage**:
- Full page load
- Score selection
- Filter changes
- Time range changes
- Tab interactions
- Chart rendering

### Manual Testing

**Checklist** (from Phase 8):
- Single score scenarios (numeric, categorical, boolean)
- Two score scenarios (same types, cross-type)
- UI/UX (loading, empty, error states)
- Edge cases (same score twice, no data, etc.)

### Test Commands

```bash
# Run all score analytics tests
pnpm --filter=web run test -- --testPathPattern="scoreAnalytics"

# Run transformer tests only
pnpm --filter=web run test -- --testPathPattern="scoreAnalyticsTransformers"

# Run integration tests only
pnpm --filter=web run test -- --testPathPattern="ScoreAnalytics.integration"

# Run with coverage
pnpm --filter=web run test -- --testPathPattern="scoreAnalytics" --coverage
```

---

## Rollback Plan

### Quick Rollback (5 minutes)

If issues are found after Phase 9 swap:

```bash
# 1. Restore old page
mv web/src/pages/project/[projectId]/scores/analytics.tsx \
   web/src/pages/project/[projectId]/scores/analytics-v2-broken.tsx

mv web/src/pages/project/[projectId]/scores/analytics-old.tsx \
   web/src/pages/project/[projectId]/scores/analytics.tsx

# 2. Restore old components
mv web/src/features/scores/components/analytics \
   web/src/features/scores/components/score-analytics-broken

mv web/src/features/scores/components/analytics-old \
   web/src/features/scores/components/analytics

# 3. Restore old tab in navigation
git restore web/src/features/navigation/utils/scores-tabs.ts

# 4. Restart dev server
pnpm run dev:web
```

**Recovery Time**: < 5 minutes

### Git-Based Rollback

```bash
# Revert to backup branch
git checkout backup/analytics-old

# Or cherry-pick old implementation
git cherry-pick <commit-hash-of-old-implementation>
```

### Gradual Rollback (Feature Flag)

If you want to be extra cautious, add a feature flag:

```typescript
// .env
NEXT_PUBLIC_USE_NEW_ANALYTICS=true

// analytics.tsx
const useNewAnalytics = process.env.NEXT_PUBLIC_USE_NEW_ANALYTICS === 'true';

if (useNewAnalytics) {
  return <NewAnalyticsImplementation />;
} else {
  return <OldAnalyticsImplementation />;
}
```

**Benefits**:
- Toggle between implementations instantly
- Can A/B test with different users
- Zero downtime rollback

### Zero Downtime Strategy

Because both implementations exist simultaneously until Phase 9, you can:

1. **Deploy with both tabs** (`/analytics` and `/analytics-v2`)
2. **Monitor for errors** in new implementation
3. **Gradually migrate users** (e.g., beta users first)
4. **Keep old tab** as fallback
5. **Remove old tab** only after full confidence

**Monitoring**:
```typescript
// Add error boundary to new implementation
<ErrorBoundary
  fallback={<FallbackToOldAnalytics />}
  onError={(error) => {
    logError('New analytics failed', error);
    // Optionally redirect to old analytics
  }}
>
  <ScoreAnalyticsProvider>
    <ScoreAnalyticsDashboard />
  </ScoreAnalyticsProvider>
</ErrorBoundary>
```

---

## Success Criteria

### Code Quality Metrics

Before swapping in Phase 9, verify:

- [ ] **Code reduction**: New implementation ≤ 2,000 lines (target: 1,650)
- [ ] **Zero duplication**: No duplicated transformation logic
- [ ] **Test coverage**: ≥ 80% for new code
  - [ ] Transformers: 100% (pure functions)
  - [ ] Hook: ≥ 80%
  - [ ] Provider: ≥ 70%
  - [ ] Cards: ≥ 70%
- [ ] **Type safety**: No `any` types, all props typed
- [ ] **Linter**: Zero errors
- [ ] **TSC**: Zero errors

### Functional Parity

Verify new implementation matches old:

- [ ] **All score types work**: Numeric, categorical, boolean
- [ ] **Single score mode**: Distribution, timeline, statistics match old
- [ ] **Two score mode**: All charts and metrics match old
- [ ] **Tab switching**: Behavior identical to old
- [ ] **Loading states**: Same UX as old
- [ ] **Empty states**: Same UX as old
- [ ] **Error states**: Same UX as old
- [ ] **URL state**: Same persistence as old
- [ ] **Time range filtering**: Same behavior as old
- [ ] **Object type filtering**: Same behavior as old

### Performance

Verify performance is equal or better:

- [ ] **Initial load**: ≤ old implementation load time
- [ ] **Tab switching**: < 100ms (should be instant)
- [ ] **Memory usage**: No leaks, ≤ old implementation
- [ ] **Re-renders**: Minimal (use React DevTools Profiler)
- [ ] **Bundle size**: ≤ old implementation (check with `pnpm run build`)

### Developer Experience

- [ ] **Documentation updated**: README.md complete
- [ ] **JSDoc comments**: All public functions documented
- [ ] **Examples provided**: How to add new score type
- [ ] **Tests runnable**: All test commands work
- [ ] **Clear architecture**: New team members can understand quickly

### User Experience

Side-by-side comparison shows:

- [ ] **Identical output**: Charts show same data
- [ ] **Identical behavior**: Interactions work the same
- [ ] **Same or better UX**: No regressions in UX
- [ ] **No bugs introduced**: Thorough manual testing passed

### Sign-Off Checklist

Before marking refactor complete:

- [ ] All phases 1-10 complete
- [ ] All success criteria met
- [ ] Code reviewed by another developer
- [ ] Manual testing checklist 100% complete
- [ ] Side-by-side comparison shows parity
- [ ] Unit tests at ≥80% coverage
- [ ] Integration tests passing
- [ ] Old implementation backed up (git branch)
- [ ] Rollback plan tested (dry run)
- [ ] Documentation complete
- [ ] Team trained on new architecture

---

## Appendix: Quick Reference

### Common Commands

```bash
# Create new folders
mkdir -p web/src/features/scores/components/score-analytics/cards
mkdir -p web/src/features/scores/lib/transformers
mkdir -p web/src/features/scores/lib/hooks

# Run tests
pnpm --filter=web run test -- --testPathPattern="scoreAnalytics"

# Run linter
pnpm --filter=web run lint

# Type check
pnpm --filter=web exec tsc --noEmit

# Start dev server
pnpm run dev:web

# Build
pnpm --filter=web run build
```

### File Paths

```
Transformers:
  /web/src/features/scores/lib/transformers/scoreAnalyticsTransformers.ts

Hook:
  /web/src/features/scores/lib/hooks/useScoreAnalyticsQuery.ts

Provider:
  /web/src/features/scores/components/score-analytics/ScoreAnalyticsProvider.tsx

Cards:
  /web/src/features/scores/components/score-analytics/cards/StatisticsCard.tsx
  /web/src/features/scores/components/score-analytics/cards/DistributionChartCard.tsx
  /web/src/features/scores/components/score-analytics/cards/TimelineChartCard.tsx
  /web/src/features/scores/components/score-analytics/cards/HeatmapCard.tsx

Layout:
  /web/src/features/scores/components/score-analytics/ScoreAnalyticsDashboard.tsx
  /web/src/features/scores/components/score-analytics/ScoreAnalyticsHeader.tsx

Page:
  /web/src/pages/project/[projectId]/scores/analytics-v2.tsx (during dev)
  /web/src/pages/project/[projectId]/scores/analytics.tsx (after swap)

Tests:
  /web/src/__tests__/scoreAnalyticsTransformers.test.ts
  /web/src/__tests__/useScoreAnalyticsQuery.test.ts
  /web/src/__tests__/ScoreAnalyticsProvider.test.tsx
  /web/src/__tests__/ScoreAnalyticsCards.integration.test.tsx
```

### Import Paths

```typescript
// Transformers
import {
  extractCategories,
  fillDistributionBins,
  calculateModeMetrics,
  transformHeatmapData,
  generateBinLabels,
} from '@/src/features/scores/lib/transformers/scoreAnalyticsTransformers';

// Hook
import { useScoreAnalyticsQuery } from '@/src/features/scores/lib/hooks/useScoreAnalyticsQuery';

// Provider
import { ScoreAnalyticsProvider, useScoreAnalytics } from '@/src/features/scores/components/score-analytics/ScoreAnalyticsProvider';

// Cards (auto-imported by Dashboard, but can import individually)
import { StatisticsCard } from '@/src/features/scores/components/score-analytics/cards/StatisticsCard';

// Layout
import { ScoreAnalyticsDashboard } from '@/src/features/scores/components/score-analytics/ScoreAnalyticsDashboard';
import { ScoreAnalyticsHeader } from '@/src/features/scores/components/score-analytics/ScoreAnalyticsHeader';
```

---

## Timeline Summary

| Phase | Day | Duration | Description | Risk |
|-------|-----|----------|-------------|------|
| 1. Setup | 1 | 2h | Create folders, add route, update nav | None |
| 2. Transformers | 1 | 4h | Extract pure functions + tests | Low |
| 3. Hook | 2 | 3h | useScoreAnalyticsQuery | Low |
| 4. Provider | 2 | 2h | Context provider | Low |
| 5. Cards | 3-4 | 8h | 4 smart card components | Med |
| 6. Dashboard | 4 | 2h | Layout components | Low |
| 7. Page | 5 | 3h | Simplified analytics-v2 | Low |
| 8. Testing | 5-6 | 8h | Manual + automated testing | Low |
| 9. Swap | 6 | 1h | Atomic replacement | Med |
| 10. Docs | 6 | 2h | Documentation + cleanup | None |

**Total**: 6-7 days (35 hours with buffer)

**Risk Mitigation**: Parallel implementation means zero risk until Phase 9, and even then we have 5-minute rollback.

---

## Contact

For questions about this refactoring plan:
- **Author**: Claude (Senior Staff Engineer)
- **Date**: 2025
- **Linear Issue**: LF-XXXX
- **PR**: (will be created)

Good luck with the refactor! 🚀
