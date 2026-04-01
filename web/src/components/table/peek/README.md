# Peek View Table State Management

This document describes how table state (filters, sorting, pagination, search) is managed and persisted in peek views when navigating between items using K/J keyboard shortcuts.

## Overview

Peek views allow users to quickly preview table items in a side panel. When navigating between items using K/J shortcuts, tables inside the peek view remount, which would normally reset their state. The peek state management system prevents this by storing table state in a context that persists across navigation.

## Architecture

The peek state architecture separates the persisting context provider from the remounting content:

```
┌─────────────────────────────────────────────────────────────┐
│ TablePeekView (peek.tsx)                                    │
│                                                             │
│  <PeekTableStateProvider>  ← Persists across itemId changes│
│    <div key={itemId}>      ← Only this remounts            │
│      {children}            ← Tables remount here           │
│    </div>                                                   │
│  </PeekTableStateProvider>                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │ Table Components (e.g., ScoresTable)  │
        │                                       │
        │  Hooks automatically detect peek:     │
        │  • useSidebarFilterState()            │
        │  • useOrderByState()                  │
        │  • usePaginationState()               │
        │  • useFullTextSearch()                │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌────────────────────────────────────────┐
        │ Hook reads from peek context:          │
        │                                        │
        │ const peekContext = usePeekTableState()│
        │ if (peekContext) {                     │
        │   return peekContext.tableState.X      │
        │ }                                      │
        │ return urlState                        │
        └────────────────────────────────────────┘
```

### Key Components

#### PeekTableStateProvider

**Location:** [`contexts/PeekTableStateContext.tsx`](./contexts/PeekTableStateContext.tsx)

- Provides persistent state storage across peek item navigation
- Stores filters, sorting, pagination, and search state
- Does NOT remount when `itemId` changes during K/J navigation
- Tables inside the peek view automatically use this context when available

#### Peek-Aware Hooks

All state management hooks automatically detect when they're running inside a peek view and read/write state accordingly:

1. **`useSidebarFilterState`** - Manages filter state
   - Location: `web/src/features/filters/hooks/useSidebarFilterState.tsx`
   - Checks for `usePeekTableState()` and reads from `peekContext.tableState.filters`

2. **`useOrderByState`** - Manages sorting state
   - Location: `web/src/features/orderBy/hooks/useOrderByState.ts`
   - Returns peek context state or URL state based on context availability

3. **`usePaginationState`** - Manages pagination state
   - Location: `web/src/hooks/usePaginationState.ts`
   - Supports both `page/limit` and `pageIndex/pageSize` formats
   - Automatically detects peek context and uses it if available

4. **`useFullTextSearch`** - Manages search query state
   - Location: `web/src/components/table/use-cases/useFullTextSearch.tsx`
   - Handles both search query and search type state

## Behavior

### ✅ Expected Behavior (Fully Integrated Tables)

When using K/J navigation in peek view for fully integrated tables:

1. User applies filter/sort/pagination/search
2. State is stored in `PeekTableStateContext`
3. User presses K/J → `itemId` changes → peek content remounts
4. `PeekTableStateProvider` does NOT remount
5. Remounted table hooks read from the same context instance
6. Table automatically restores previous state

**Fully Integrated Tables:**

- Traces table
- Observations table
- Scores table
- Evaluators table
- Events table
- Eval Templates table (search now peek-aware)

### 🔄 Future-Proofed Tables (Peek-Aware Hooks Added)

These tables don't currently have peek views but now use peek-aware hooks, making them ready if peek views are added:

- Sessions table
- Models table
- Score Configs table

## Table State Interface

The `PeekTableState` interface defines what state is persisted:

```typescript
interface PeekTableState {
  filters: FilterState;
  sorting: OrderByState;
  pagination: { pageIndex: number; pageSize: number };
  search: { query: string | null; type: string[] };
}
```

## Implementation Guide

### Adding Peek Views to a New Table

To make a table work with peek state persistence:

1. **Use peek-aware hooks instead of direct URL state management:**

   ```typescript
   // ❌ Don't use useQueryParams directly
   const [paginationState, setPaginationState] = useQueryParams({
     pageIndex: withDefault(NumberParam, 0),
     pageSize: withDefault(NumberParam, 50),
   });

   // ✅ Use usePaginationState (automatically peek-aware)
   const [paginationState, setPaginationState] = usePaginationState(0, 50);
   ```

2. **For search, use useFullTextSearch:**

   ```typescript
   // ❌ Don't use useQueryParam directly
   const [searchQuery, setSearchQuery] = useQueryParam("search", StringParam);

   // ✅ Use useFullTextSearch (automatically peek-aware)
   const { searchQuery, setSearchQuery } = useFullTextSearch();
   ```

3. **For filters, use useSidebarFilterState:**

   ```typescript
   // Already peek-aware, no changes needed if already using this hook
   const queryFilter = useSidebarFilterState(filterConfig, options, projectId);
   ```

4. **For sorting, use useOrderByState:**

   ```typescript
   // Already peek-aware, no changes needed if already using this hook
   const [orderByState, setOrderByState] = useOrderByState({
     column: "createdAt",
     order: "DESC",
   });
   ```

### How It Works Internally

Each peek-aware hook follows the same pattern:

```typescript
export const useSomeState = () => {
  const peekContext = usePeekTableState();

  // URL-based state (fallback)
  const [urlState, setUrlState] = useQueryParam(...);

  if (peekContext) {
    // In peek view: read/write from context
    const value = peekContext.tableState.someProperty;
    const setValue = (newValue) => {
      peekContext.setTableState({
        ...peekContext.tableState,
        someProperty: newValue,
      });
    };
    return { value, setValue };
  }

  // Not in peek view: use URL state
  return { value: urlState, setValue: setUrlState };
};
```

## State Lifecycle and Caveats

### When State Persists (Intended ✓)

Table state **persists** during K/J keyboard navigation within the same peek view:

```
1. Open trace T1 → apply filter to ScoresTable
2. Press K/J → navigate to trace T2
3. ScoresTable in T2 retains the filter ✓
```

**Reason:** `PeekTableStateProvider` remains mounted during K/J navigation. Only the content with `key={itemId}` remounts, preserving user's filter/sort/pagination preferences across items of the same type.

### When State Resets (Safe ✓)

Table state **resets** when the peek view closes:

```
1. Open trace T1 → apply filter
2. Close peek (X button/Escape/click outside)
3. Open observation O1 → fresh state ✓
```

**Reason:** Closing the peek removes the `peek` URL parameter. This causes the `<Sheet>` component to close and unmount `<SheetContent>`, which unmounts `PeekTableStateProvider` and destroys all state.

### Known Risk: Multiple Tables in One Peek View

**Risk Level:** LOW (theoretical edge case)

**Issue:** All tables in the same peek view share a single `PeekTableState` object. If a peek view contains multiple independent paginated tables, they share pagination/filter/sort state.

**Example:**

```
Hypothetical: Trace peek with both Scores table AND Events table
→ Navigate to page 2 of Scores table
→ context.pagination = { pageIndex: 1, pageSize: 50 }
→ Events table also shows page 2 ❌
```

**Current Reality:**

- Peek views typically contain one primary table (e.g., ScoresTable in trace details)
- Multiple instances of the same table type (e.g., trace-level scores + observation-level scores) intentionally share state
- Tables use `disableUrlPersistence` and scope data via props (`traceId`, `observationId`)

**Future Solution (if multiple independent table types are needed):**
Namespace state by table identifier:

```typescript
const filters = useSidebarFilterState(config, options, projectId, loading, {
  tableId: "scores", // Unique identifier per table
});
```

## Related Files

- Peek state context: [`contexts/PeekTableStateContext.tsx`](./contexts/PeekTableStateContext.tsx)
- Pagination hook: [`web/src/hooks/usePaginationState.ts`](../../../hooks/usePaginationState.ts)
- Full text search hook: [`use-cases/useFullTextSearch.tsx`](../use-cases/useFullTextSearch.tsx)
- Filter state hook: [`web/src/features/filters/hooks/useSidebarFilterState.tsx`](../../../features/filters/hooks/useSidebarFilterState.tsx)
- Order by hook: [`web/src/features/orderBy/hooks/useOrderByState.ts`](../../../features/orderBy/hooks/useOrderByState.ts)
