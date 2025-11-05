# Score Analytics Refactoring - Implementation State

Last Updated: 2025-11-05

## ✅ Phase 1: Setup Parallel Structure (COMPLETE)

### Completed Tasks:
- [x] Created folder structure
  - `score-analytics/transformers/`
  - `score-analytics/hooks/`
  - `score-analytics/components/`
  - `score-analytics/components/cards/`
- [x] Copied `analytics.tsx` to `analytics-v2.tsx`
- [x] Updated navigation tabs (added Analytics V2)
- [x] Verified setup (no errors, both routes work)

### Files Created:
- `/pages/project/[projectId]/scores/analytics-v2.tsx`
- `/components/score-analytics/` (folder structure)

### Files Modified:
- `/features/navigation/utils/scores-tabs.ts` (added ANALYTICS_V2 tab)

---

## ✅ Phase 2: Build Transformer Layer (COMPLETE)

### Completed Tasks:
- [x] Created `scoreAnalyticsTransformers.ts` with 5 pure functions:
  - [x] `extractCategories()` - Extracts unique categories from confusion matrix/stacked distribution
  - [x] `fillDistributionBins()` - Fills missing bins with zero counts
  - [x] `calculateModeMetrics()` - Calculates mode and mode percentage for categorical/boolean
  - [x] `transformHeatmapData()` - Transforms API data for heatmaps/confusion matrices
  - [x] `generateBinLabels()` - Generates formatted bin labels for numeric distributions
  - [x] Helper: `formatBinLabel()` - Private helper for precision-based formatting
- [x] All functions documented with JSDoc comments
- [x] All functions type-safe with explicit TypeScript interfaces
- [ ] Unit tests (SKIPPED - will add later if needed)

### Additional Work:
- [x] Replaced analytics-v2.tsx with skeleton/placeholder page
  - Shows intended architecture with 4 placeholder cards
  - Reduced from 664 lines → 180 lines (73% reduction)
  - Visual demonstration of 2x2 grid layout
  - Implementation status tracker

### Goal:
Extract all duplicated transformation logic from existing code into pure, testable functions.

**Eliminates**: ~400 lines of duplicated code
**Status**: ✅ Complete

---

## ✅ Phase 3: Build Data Hook (COMPLETE)

### File Created:
`/hooks/useScoreAnalyticsQuery.ts` (450+ lines)

### Completed Tasks:
- [x] Verified time series utilities exist
  - [x] Found `fillTimeSeriesGaps` in `/utils/fill-time-series-gaps.ts`
  - [x] Found `fillCategoricalTimeSeriesGaps` in same file
- [x] Defined TypeScript interfaces
  - [x] `ScoreAnalyticsQueryParams` - Input parameters (9 fields)
  - [x] `ScoreAnalyticsData` - Return data structure (4 main sections)
  - [x] Supporting types: `ScoreStatistics`, `ComparisonStatistics`, `Distribution`, `TimeSeries`
  - [x] Hook return type: `UseScoreAnalyticsQueryResult`
- [x] Implemented hook skeleton
  - [x] Imported all transformer functions
  - [x] Setup tRPC query with proper enable condition
  - [x] Defined return structure
- [x] Implemented transformation logic in useMemo
  - [x] Extract categories (categorical/boolean only)
  - [x] Fill distribution bins for all 6 distribution arrays
  - [x] Generate bin labels (numeric only)
  - [x] Transform heatmap data
  - [x] Calculate mode metrics for score1 and score2
  - [x] Fill time series gaps (6 time series arrays)
- [x] Calculate derived metadata
  - [x] mode: 'single' | 'two'
  - [x] isSameScore: boolean (fixed to avoid undefined)
  - [x] dataType: from score1
- [x] Testing & validation
  - [x] Fixed ObjectType definition (lowercase values)
  - [x] Fixed isSameScore type (wrap with Boolean())
  - [x] TypeScript check: ✅ No errors
  - [x] Linter check: ✅ No errors

### Hook Features:
- Single tRPC query (`api.scores.getScoreComparisonAnalytics`)
- Transforms data ONCE in useMemo (6 transformations applied)
- Returns structured data ready for Provider consumption
- Handles both single and two-score modes
- Handles same-score-selected-twice edge case
- Type-safe with explicit interfaces throughout

### Goal:
Create hook that fetches API data once and transforms it using pure functions from Phase 2.
All cards will consume this transformed data via Provider (Phase 4).

**Actual Time**: ~2.5 hours
**Status**: ✅ Complete

---

## ✅ Phase 4: Build Context Provider (COMPLETE)

### File Created:
`/components/ScoreAnalyticsProvider.tsx` (180+ lines)

### Completed Tasks:
- [x] Created `ScoreAnalyticsProvider` component
  - [x] Wraps `useScoreAnalyticsQuery` hook
  - [x] Determines color scheme based on mode (single vs two)
  - [x] Exposes via React Context
- [x] Created `useScoreAnalytics()` consumer hook
  - [x] Provides easy access to context
  - [x] Throws error if used outside Provider
- [x] Added color scheme system
  - [x] `SingleScoreColors` type (single color)
  - [x] `TwoScoreColors` type (score1 + score2 colors)
  - [x] Type guards: `isSingleScoreColors`, `isTwoScoreColors`
  - [x] Uses existing color utilities from `color-scales.ts`
- [x] Re-exported all types from hook for convenience
- [x] Testing & validation
  - [x] TypeScript check: ✅ No errors
  - [x] Linter check: ✅ No errors

### Provider Features:
- Single source of truth for analytics data
- Automatic color assignment based on single/two-score mode
- Type-safe context with proper error handling
- Eliminates prop drilling to card components
- Clean API via `useScoreAnalytics()` hook

### Goal:
Wrap data hook and expose via React Context.

**Actual Time**: ~1 hour
**Status**: ✅ Complete

---

## 🚧 Phase 5: Build Card Components (IN PROGRESS)

### Files Created:
1. ✅ `/components/cards/StatisticsCard.tsx` (375+ lines) - COMPLETE

### Completed Tasks:
- [x] **StatisticsCard.tsx** (~1.5 hours)
  - [x] Consumes `useScoreAnalytics()` hook
  - [x] Displays summary stats (mean, std, mode, correlation)
  - [x] Handles single vs two-score modes
  - [x] Shows loading/empty states
  - [x] TypeScript: ✅ No errors
  - [x] Linter: ✅ No errors

### Pending Tasks:
- [ ] `TimelineChartCard.tsx` (2 hours)
- [ ] `DistributionChartCard.tsx` (2 hours)
- [ ] `HeatmapCard.tsx` (2 hours)

### Goal:
Create smart cards that consume context and handle own rendering logic.

**Progress**: 25% (1/4 cards complete)
**Time Spent**: ~1.5 hours
**Time Remaining**: ~6 hours

---

## ⏳ Phase 6: Build Dashboard Layout (TODO)

### Pending Tasks:
- [ ] `ScoreAnalyticsDashboard.tsx`
- [ ] `ScoreAnalyticsHeader.tsx`

### Goal:
Create layout components for 2x2 grid and header controls.

---

## ⏳ Phase 7: Wire New Page (TODO)

### Pending Tasks:
- [ ] Simplify `analytics-v2.tsx`
- [ ] Remove 7 useMemo hooks
- [ ] Remove mode calculation
- [ ] Remove heatmap preprocessing
- [ ] Wire to provider

### Goal:
Reduce page from 668 lines to ~200 lines.

---

## ⏳ Phase 8: Testing & Validation (TODO)

### Pending Tasks:
- [ ] Manual testing checklist (single/two scores, all data types)
- [ ] Side-by-side comparison with old implementation
- [ ] Performance testing (optional)

---

## ⏳ Phase 9: Atomic Swap (TODO)

### Pending Tasks:
- [ ] Backup old implementation
- [ ] Rename `score-analytics/` to `analytics/`
- [ ] Update imports
- [ ] Remove ANALYTICS_V2 tab
- [ ] Delete old files

---

## ⏳ Phase 10: Cleanup & Documentation (TODO)

### Pending Tasks:
- [ ] Delete old files (after buffer period)
- [ ] Update README.md
- [ ] Add JSDoc comments

---

## Current Status Summary

| Phase | Status | Progress | Estimated Time Remaining |
|-------|--------|----------|-------------------------|
| 1. Setup | ✅ Complete | 100% | 0 hours |
| 2. Transformers | ✅ Complete | 100% | 0 hours |
| 3. Hook | ✅ Complete | 100% | 0 hours |
| 4. Provider | ✅ Complete | 100% | 0 hours |
| 5. Cards | 🚧 Next | 0% | 8 hours |
| 6. Dashboard | ⏳ Todo | 0% | 2 hours |
| 7. Page | ⏳ Todo | 0% | 3 hours |
| 8. Testing | ⏳ Todo | 0% | 8 hours |
| 9. Swap | ⏳ Todo | 0% | 1 hour |
| 10. Cleanup | ⏳ Todo | 0% | 2 hours |

**Total Progress**: ~40% (4/10 phases complete)
**Time Remaining**: ~24 hours (~4 days)

---

## Next Action

Continue with **Phase 5: Build Card Components**

Build 4 smart card components in `/components/cards/`:

1. **StatisticsCard.tsx** (~2 hours)
   - Displays summary stats (mean, std, mode, correlation)
   - Consumes `useScoreAnalytics()` hook
   - Handles single vs two-score modes
   - Shows loading/empty states

2. **TimelineChartCard.tsx** (~2 hours)
   - Time series chart (line/area)
   - Supports tabs: All / Matched (for two-score mode)
   - Handles numeric vs categorical data
   - Auto-selects appropriate chart component

3. **DistributionChartCard.tsx** (~2 hours)
   - Distribution histogram/bar chart
   - Supports tabs: Individual / Matched / Stacked
   - Handles numeric vs categorical vs boolean
   - Auto-selects appropriate chart component

4. **HeatmapCard.tsx** (~2 hours)
   - Heatmap for score comparisons
   - Numeric: 10x10 bins
   - Categorical/Boolean: Confusion matrix
   - Only shown in two-score mode

**Approach**: Build incrementally, test each card before moving to next

**Estimated Time**: 8 hours

Reference detailed-plan.md for complete implementation examples.
