# Score Analytics Refactoring Plan

## Why Refactor?

The current score analytics implementation (~3,500 lines) suffers from:

- **~400 lines of duplicated code (11%)** - Same transformations in multiple places
- **God components** - TwoScoreAnalytics at 698 lines doing too much
- **No separation of concerns** - Data transformation embedded in React components
- **Untestable business logic** - Can't unit test transformations
- **Maintenance burden** - Adding new score types requires changes in 8+ files

## What's Changing?

### New Architecture: Provider + Hook + Smart Cards

```
useScoreAnalyticsQuery (Hook)
  ↓ [Transforms monolithic API response once]
ScoreAnalyticsProvider (Context)
  ↓ [Exposes transformed data to children]
ScoreAnalyticsDashboard (Layout)
  ├─ StatisticsCard (Smart component)
  ├─ TimelineChartCard (Smart component)
  ├─ DistributionChartCard (Smart component)
  └─ HeatmapCard (Smart component)
```

**Key Principles**:
1. **Transform once** - All data transformation in `useScoreAnalyticsQuery` hook
2. **Context provides state** - Cards consume via `useScoreAnalytics()` hook
3. **Smart cards** - Each card handles own logic, rendering, loading states
4. **No prop drilling** - Context eliminates deep prop passing

### File Structure Changes

**New Files**:
```
/features/scores/
├── components/
│   ├── analytics/              [KEEP - existing, unchanged during dev]
│   └── score-analytics/        [NEW - self-contained parallel implementation]
│       ├── transformers/       [NEW]
│       │   └── scoreAnalyticsTransformers.ts
│       ├── hooks/              [NEW]
│       │   └── useScoreAnalyticsQuery.ts
│       ├── components/         [NEW]
│       │   ├── ScoreAnalyticsProvider.tsx
│       │   ├── ScoreAnalyticsDashboard.tsx
│       │   ├── ScoreAnalyticsHeader.tsx
│       │   └── cards/          [NEW]
│       │       ├── StatisticsCard.tsx
│       │       ├── DistributionChartCard.tsx
│       │       ├── TimelineChartCard.tsx
│       │       └── HeatmapCard.tsx
│       ├── plan.md
│       └── detailed-plan.md
└── pages/
    └── analytics-v2.tsx        [NEW - parallel page during dev]
```

**Files to Delete** (after swap):
- `SingleScoreAnalytics.tsx` (297 lines)
- `TwoScoreAnalytics.tsx` (698 lines)
- Old `analytics.tsx` (668 lines → becomes 150 lines)

## Process: Safe Parallel Implementation

### Strategy: Build New Alongside Old, Swap When Ready

1. **Create parallel structure** - New folder, new route (`/scores/analytics-v2`)
2. **Build incrementally** - Transformers → Hook → Provider → Cards → Page
3. **Test thoroughly** - Unit tests, side-by-side comparison
4. **Atomic swap** - Rename files, update imports, done
5. **Quick rollback available** - If issues found, 5-minute restore

### Timeline: 6-7 Days

| Phase | Duration | Description |
|-------|----------|-------------|
| 1. Setup | 2 hours | Folders, new route |
| 2. Transformers | 4 hours | Extract pure functions |
| 3. Data Hook | 3 hours | useScoreAnalyticsQuery |
| 4. Provider | 2 hours | Context provider |
| 5. Cards | 8 hours | 4 smart card components |
| 6. Dashboard | 2 hours | Layout component |
| 7. Page | 3 hours | Simplified analytics-v2.tsx |
| 8. Testing | 8 hours | Unit + integration tests |
| 9. Swap | 1 hour | Atomic replacement |
| 10. Docs | 2 hours | Update documentation |

**Zero Risk**: Old implementation untouched until Phase 9.

## Expected Outcomes

### Code Quality Improvements
- **53% code reduction** - 3,500 → 1,650 lines
- **Zero duplication** - All transformations unified
- **100% testable** - Pure functions, easy unit tests
- **Clear ownership** - Each component has single responsibility

### Developer Experience Improvements
- **Easy to extend** - New score types: 3 files instead of 8
- **Easy to debug** - Clear data flow, single transformation point
- **Easy to maintain** - No god components, clear separation

### Performance
- **Same or better** - Provider-level memoization
- **Single query** - Keep monolithic API response (conscious design choice)

## Next Steps

1. Review this plan
2. Read [detailed-plan.md](./detailed-plan.md) for full implementation details
3. Start with Phase 1: Setup parallel structure
4. Implement phases 2-8 incrementally
5. Test thoroughly before Phase 9 swap
6. Celebrate cleaner codebase!

---

For complete implementation details, see [detailed-plan.md](./detailed-plan.md).
