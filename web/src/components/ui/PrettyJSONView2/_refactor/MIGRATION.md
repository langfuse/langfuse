# PrettyJsonView Refactor: Migration Strategy

## Migration Overview

**Goal:** Replace PrettyJsonView (1,422 lines, 139K+ DOM nodes) with specialized, virtualized components

**Scope:** 17 files across 4 usage patterns
**Timeline:** 4 weeks, phased by risk level
**Strategy:** Progressive rollout with feature flags, ordered from simplest → most complex

---

## Usage Patterns Identified

| Pattern | Files | Complexity | Risk | Week |
|---------|-------|------------|------|------|
| **Tool Arguments** | 2 | Low | Low | 1 |
| **Metadata Display** | 8 | Medium | Medium | 2 |
| **Log View** | 3 | Medium | Medium | 3 |
| **I/O Display** | 4 | High | High | 4 |

---

## Phase 1: Tool Arguments (Week 1)

**Files:**
- `ChatMessageList.tsx` - Tool call arguments display
- `SectionToolDefinitions.tsx` - Tool definitions

**Migration:**
```diff
- <PrettyJsonView json={toolCall.args} currentView="pretty" />
+ <SimpleDataViewer data={toolCall.args} />
```

**Why First:**
- Simplest pattern (no view toggle, no expansion state)
- Low traffic (only visible in ChatML format)
- Small data (tool arguments typically < 1KB)
- No virtualization needed

**Testing:**
- Visual regression: Screenshot comparison in ChatML traces
- Functional: Verify tool arguments display correctly
- Performance: Should be instant (no virtualization overhead)

**Rollback:** Simple - revert imports

---

## Phase 2: Metadata Display (Week 2)

**Files:**
- `ObservationDetailView.tsx` - Observation metadata
- `TraceDetailView.tsx` - Trace metadata
- `DatasetItemDetail.tsx` - Dataset item metadata
- `PromptDetail.tsx` - Prompt metadata
- 4 other metadata displays

**Migration:**
```diff
- <PrettyJsonView
-   title="Metadata"
-   json={trace.metadata}
-   currentView={currentView}
-   externalExpansionState={expansionState.metadata}
-   onExternalExpansionChange={(exp) => setFieldExpansion("metadata", exp)}
- />
+ <MetadataViewer
+   title="Metadata"
+   data={trace.metadata}
+   viewMode={viewMode}
+   expansionState={expansionState.metadata}
+   onExpansionChange={(exp) => setFieldExpansion("metadata", exp)}
+ />
```

**Why Second:**
- Moderate complexity (view toggle + expansion state)
- Moderate traffic (every trace/observation view)
- Variable data size (typically 1-100KB)
- Needs virtualization for large metadata

**Testing:**
- Visual regression: Compare metadata rendering in all detail views
- Functional: Verify JSON/Pretty toggle, expansion persistence
- Performance: Test with 100KB metadata object

**Feature Flag:** `ENABLE_METADATA_VIEWER_V2`

**Rollback:** Toggle feature flag

---

## Phase 3: Log View (Week 3)

**Files:**
- `TraceLogView.tsx` - Concatenated observation display
- `LogViewRowExpanded.tsx` - Expanded row I/O
- `LogViewRowPreview.tsx` - Preview row I/O

**Migration:**
```diff
- <PrettyJsonView
-   json={observation.output}
-   currentView="pretty"
-   codeClassName="..."
- />
+ <IODataViewer
+   output={observation.output}
+   viewMode="pretty"
+   className="..."
+ />
```

**Why Third:**
- Moderate complexity (embedded in virtualized list)
- High traffic (log view is popular feature)
- Large data (concatenated observations can be 10MB+)
- Already virtualized (react-window), need nested virtualization

**Testing:**
- Visual regression: Compare log view rendering for 100+ observation traces
- Functional: Verify expansion state doesn't break virtualization
- Performance: Test with 500 observations, measure scroll FPS
- Edge case: Nested virtualization (Virtuoso wrapping JSONViewer)

**Feature Flag:** `ENABLE_LOG_VIEW_V2`

**Rollback:** Toggle feature flag

---

## Phase 4: I/O Display (Week 4)

**Files:**
- `IOPreviewPretty.tsx` - Pretty view I/O
- `IOPreviewJSON.tsx` - JSON view I/O
- `ObservationDetailView.tsx` - Observation I/O
- `TraceDetailView.tsx` - Trace I/O

**Migration:**
```diff
// IOPreviewPretty.tsx
- <PrettyJsonView
-   title="Input"
-   json={parsedInput}
-   currentView="pretty"
-   externalExpansionState={inputExpansionState}
-   onExternalExpansionChange={onInputExpansionChange}
- />
+ <IODataViewer
+   input={parsedInput}
+   viewMode="pretty"
+   expansionState={{ input: inputExpansionState }}
+   onExpansionChange={(state) => onInputExpansionChange(state.input)}
+ />
```

**Why Last:**
- Highest complexity (ChatML detection, markdown, media, expansion)
- Highest traffic (every observation/trace view)
- Largest data (observations can be 10MB+)
- Most critical path (any bug affects all users)

**Testing:**
- Visual regression: Compare I/O rendering across 20+ test traces
- Functional: Verify ChatML, markdown, media, expansion all work
- Performance: Test with 10MB observation, measure render time
- Integration: Test with Web Worker parsing + progressive rendering
- Edge cases: ChatML + markdown limit, mixed content types

**Feature Flag:** `ENABLE_IO_VIEWER_V2`

**Rollback:** Toggle feature flag

---

## Risk Mitigation

### Feature Flags
All migrations use feature flags for instant rollback without deployment:
```typescript
// packages/shared/src/features/feature-flags.ts
export const FEATURE_FLAGS = {
  ENABLE_METADATA_VIEWER_V2: false,
  ENABLE_LOG_VIEW_V2: false,
  ENABLE_IO_VIEWER_V2: false,
} as const;
```

### Backwards Compatibility
PrettyJsonView remains available for:
1. Any usages we haven't migrated yet
2. Rollback scenarios
3. External usages (if any)

### Gradual Rollout
Each phase:
1. **Week N, Day 1-3:** Implement new component
2. **Week N, Day 4:** Enable feature flag for internal testing
3. **Week N, Day 5:** Monitor performance metrics
4. **Week N, Weekend:** Enable for 10% users (if cloud deployment)
5. **Week N+1, Monday:** Review metrics, decide 100% or rollback

### Success Metrics
Track before/after for each phase:

**Performance:**
- Initial render time (target: < 150ms)
- DOM node count (target: < 2,000 nodes)
- Memory usage (target: < 5MB)
- Scroll FPS (target: 60fps)

**Functionality:**
- Expansion state persists correctly
- View toggle works (JSON ↔ Pretty)
- Media attachments display
- Copy to clipboard works

**Stability:**
- Error rate (target: < 0.1%)
- User reports (target: 0 critical bugs)

---

## Testing Strategy

### Unit Tests
- Each new component (JSONViewer, TableViewer, etc.)
- Props validation
- Edge cases (null, undefined, circular refs)

### Integration Tests
- Expansion state management
- View mode switching
- Media attachment display

### Visual Regression Tests
- Screenshot comparison for each usage pattern
- Test with real production data samples

### Performance Tests
- Lighthouse scores
- React DevTools Profiler
- Chrome Performance tab
- Memory profiler

---

## Rollback Plan

**Per-Phase Rollback:**
1. Toggle feature flag to `false`
2. Deploy (no code changes needed)
3. Verify PrettyJsonView fallback working
4. Investigate issue in dev environment

**Full Rollback:**
1. Revert all migrations
2. Remove new components (keep for future retry)
3. Document lessons learned

---

## Post-Migration

### Deprecation
After all 4 phases complete and stable for 2 weeks:
1. Mark PrettyJsonView as `@deprecated`
2. Add JSDoc warning pointing to new components
3. Schedule removal for 3 months later

### Documentation
- Update component docs with new usage patterns
- Add migration guide for external users (if applicable)
- Update Storybook examples

### Monitoring
Continue tracking metrics for 1 month post-migration to catch regressions.
