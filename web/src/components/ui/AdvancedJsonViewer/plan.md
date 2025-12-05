# Implementation Plan: AdvancedJsonViewer

## Overview

Build a custom, fully-featured JSON viewer from scratch to replace `react-obj-view`. This component will be self-contained with zero external dependencies (except @tanstack/react-virtual and @radix-ui which are already in the project).

## Directory Structure

```
web/src/components/ui/AdvancedJsonViewer/
├── plan.md                              # This plan document
├── README.md                            # Component documentation
├── index.ts                             # Public exports
│
├── AdvancedJsonViewer.tsx              # Main component
├── VirtualizedJsonViewer.tsx           # Virtualized mode
├── SimpleJsonViewer.tsx                # Non-virtualized mode
│
├── components/                         # Rendering components
│   ├── JsonRow.tsx                     # Single row renderer
│   ├── JsonValue.tsx                   # Value renderer (typed)
│   ├── JsonKey.tsx                     # Key renderer
│   ├── ExpandButton.tsx                # Chevron toggle
│   ├── LineNumber.tsx                  # Line number display
│   ├── CopyButton.tsx                  # Copy action button
│   ├── SearchBar.tsx                   # Search UI
│   └── TruncatedString.tsx            # String with popover
│
├── hooks/                              # Custom hooks
│   ├── useJsonFlattener.ts            # Flattening logic
│   ├── useExpansionState.ts           # Expansion management
│   ├── useJsonSearch.ts               # Search logic
│   └── useJsonTheme.ts                # Theme resolution
│
├── utils/                              # Pure utilities
│   ├── flattenJson.ts                 # Core flattening algorithm
│   ├── jsonTypes.ts                   # Type detection
│   ├── pathUtils.ts                   # Path manipulation
│   ├── searchJson.ts                  # Search algorithm
│   ├── estimateRowHeight.ts           # Height estimation
│   └── treeFlattening.ts              # COPIED from VirtualizedTree
│
├── types.ts                            # TypeScript types
│
├── styles/                             # Styling
│   └── json-viewer.css                # Component styles
│
└── __tests__/                          # Tests
    ├── flattenJson.test.ts
    ├── jsonTypes.test.ts
    ├── pathUtils.test.ts
    ├── searchJson.test.ts
    └── treeFlattening.test.ts         # COPIED tests
```

## Files Copied from Existing Codebase

### 1. Tree Flattening Logic
**Source:** `web/src/components/trace2/components/_shared/tree-flattening.ts`
**Destination:** `utils/treeFlattening.ts`
**Reason:** Reuse proven iterative flattening algorithm for tree structures

### 2. VirtualizedTree Pattern (Reference Only)
**Source:** `web/src/components/trace2/components/_shared/VirtualizedTree.tsx`
**Action:** Use as reference for TanStack Virtual setup patterns

## Implementation Phases

### Phase 1: Foundation (Day 1-2)
1. ✅ Create directory structure
2. ✅ Write plan.md (this file)
3. ⏳ Write types.ts - All TypeScript interfaces
4. ⏳ Write utils/jsonTypes.ts - Type detection functions
5. ⏳ Write utils/pathUtils.ts - Path manipulation utilities
6. ⏳ Copy utils/treeFlattening.ts from existing code
7. ⏳ Write tests for jsonTypes and pathUtils

### Phase 2: Core Algorithm (Day 3-4)
8. Write utils/flattenJson.ts - Main flattening algorithm
9. Write utils/searchJson.ts - Search implementation
10. Write utils/estimateRowHeight.ts - Height estimation
11. Write comprehensive tests for flattening and search
12. Create hooks/useJsonFlattener.ts hook

### Phase 3: Basic Rendering (Day 5-7)
13. Write components/JsonKey.tsx - Key rendering
14. Write components/JsonValue.tsx - Value rendering with type-based styling
15. Write components/TruncatedString.tsx - String truncation with Radix HoverCard
16. Write components/ExpandButton.tsx - Chevron button
17. Write components/LineNumber.tsx - Line number display
18. Write components/CopyButton.tsx - Copy functionality
19. Write components/JsonRow.tsx - Combine all into row
20. Write SimpleJsonViewer.tsx - Non-virtualized implementation

### Phase 4: Virtualization (Day 8-10)
21. Write VirtualizedJsonViewer.tsx - TanStack Virtual integration
22. Optimize row height estimation
23. Implement scroll-to-index for search
24. Test with large JSON files (1MB, 10MB)
25. Performance benchmarking and tuning

### Phase 5: Search & Interaction (Day 11-13)
26. Write hooks/useJsonSearch.ts - Search hook
27. Write components/SearchBar.tsx - Search UI
28. Implement search highlighting in JsonRow
29. Implement navigation (next/prev match)
30. Auto-expand paths to show matches

### Phase 6: Theme System (Day 14-15)
31. Write hooks/useJsonTheme.ts - Theme resolution
32. Write styles/json-viewer.css - CSS variables
33. Support light/dark mode
34. Make theme customizable via props

### Phase 7: Main Component (Day 16-17)
35. Write AdvancedJsonViewer.tsx - Main orchestrator
36. Implement expansion state management
37. Wire up all hooks and components
38. Add loading states and error boundaries

### Phase 8: Documentation & Testing (Day 18-20)
39. Write README.md - Usage documentation
40. Write integration tests
41. Test with real Langfuse data
42. Test edge cases (empty objects, deep nesting, circular refs)
43. Performance testing with 10MB+ JSON

### Phase 9: Integration (Day 21-22)
44. Create index.ts with public exports
45. Replace react-obj-view in one test location
46. Verify expansion state compatibility
47. Test in actual trace view

### Phase 10: Migration (Day 23-25)
48. Replace all react-obj-view usage
49. Update related components
50. Remove react-obj-view dependency
51. Final testing and polish

## Key Requirements

### Self-Contained
- ✅ Zero external dependencies except: @tanstack/react-virtual, @radix-ui/* (already in project deps)
- ✅ Copy any needed utilities from existing codebase
- ✅ Include all tests with copied code
- ✅ No imports from outside AdvancedJsonViewer directory
- ✅ Complete TypeScript types within component

### Features Checklist
- ✅ Virtualized mode (TanStack Virtual)
- ✅ Non-virtualized mode (for small data)
- ✅ Theming via props and CSS variables
- ✅ Correct indentation with depth tracking
- ✅ String truncation with popover (Radix HoverCard)
- ✅ Array item numbers and optional grouping
- ✅ Search with row highlighting
- ✅ Reliable scroll-to-match (using scrollToIndex API)
- ✅ Optional line numbers
- ✅ Expand/collapse UI (chevrons next to line numbers, not indented)
- ✅ Programmatic expansion state compatible with existing system
- ✅ Copy JSON actions
- ✅ Optional long string wrapping without newlines

### Performance Targets
- Initial render < 200ms for 10MB JSON
- DOM nodes: ~500-2,000 (vs 139K+ with react-obj-view)
- Memory: ~2-5MB (vs ~30MB with react-obj-view)
- Smooth 60fps scrolling
- Search navigation works reliably (no DOM query retries)

## Testing Strategy

### Unit Tests
- All utility functions (jsonTypes, pathUtils, flattenJson, searchJson)
- Row height estimation
- Theme resolution

### Integration Tests
- Flattening with expansion state
- Search with match navigation
- Expansion state changes
- Theme switching

### Component Tests
- JsonRow rendering with different value types
- TruncatedString popover behavior
- ExpandButton toggle
- CopyButton functionality

### Performance Tests
- Large JSON files (1MB, 5MB, 10MB)
- Deep nesting (50+ levels)
- Wide objects (1000+ keys)
- Large arrays (10,000+ items)

### Edge Case Tests
- Null and undefined values
- Empty objects and arrays
- Circular references (graceful handling)
- Special characters in keys
- Very long strings (100KB+)
- Mixed nesting (arrays of objects of arrays)

## Estimated Metrics

- **Total Implementation:** 20-25 developer days
- **Calendar Time:** 4-5 weeks (with testing and iteration)
- **Lines of Code:** ~3,500 lines (including tests and documentation)
- **File Count:** ~27 files
- **Test Coverage Target:** >80%

## Success Criteria

✅ All features from requirements implemented
✅ 100% TypeScript with strict types
✅ Zero external dependencies (except TanStack + Radix)
✅ Self-contained in AdvancedJsonViewer directory
✅ Test coverage >80%
✅ Renders 10MB JSON in <200ms
✅ Smooth 60fps scrolling
✅ Search navigation works reliably
✅ Compatible with existing expansion state system (Record<string, boolean> | boolean)
✅ Drop-in replacement for react-obj-view
✅ No regressions in existing functionality

## Implementation Notes

### Expansion State Compatibility
The component must support the existing expansion state format:
- `boolean`: true = expand all, false = collapse all
- `Record<string, boolean>`: per-path expansion state (e.g., `{ "root.users.0": true }`)

### Search Implementation
Unlike react-obj-view's DOM-based search (which requires retries), we use:
1. Index-based search on the flat row array
2. Direct `scrollToIndex` from TanStack Virtual
3. Automatic ancestor expansion when navigating to matches
4. No setTimeout retries needed

### Theme System
Use CSS variables for theming to support:
- Light/dark mode auto-detection
- Custom color schemes via props
- Consistent with existing Langfuse theme system

### Performance Optimizations
- Memoize flattened rows with useMemo
- Use React.memo for row components
- Virtualize only when needed (threshold: ~1000 rows)
- Estimate row heights accurately to minimize re-layouts
- Batch expansion state updates

## Next Steps

1. ✅ Create directory structure
2. ⏳ Implement Phase 1 (Foundation)
3. Implement Phase 2 (Core Algorithm)
4. Continue through all phases
5. Final integration and testing

---

Last Updated: 2025-01-05
Status: In Progress - Phase 1
