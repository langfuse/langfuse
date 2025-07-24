# Pivot Table Sorting Feature Technical Specification

## 1. System Overview

### Core Purpose and Value Proposition

The Pivot Table Sorting Feature enhances Langfuse's data analysis capabilities by allowing users to sort pivot table data hierarchically - first by group totals, then by individual items within groups. This enables users to identify patterns, outliers, and trends in their trace data more effectively.

### Key Workflows

1. **Widget Configuration**: Users set default sort preferences during widget creation
2. **Interactive Sorting**: Users click column headers to sort data with visual feedback
3. **Persistence**: Sort preferences are saved per widget instance in session storage
4. **Server-Side Processing**: Sorting is applied at the database level before row limiting

### System Architecture

- **Client-Side**: React components with session storage for sort state
- **Server-Side**: Database query modifications to support ORDER BY clauses
- **Data Flow**: Widget config → Server query → Client render → User interaction → Persistence

## 2. Project Structure

### Modified Files

```
web/src/features/widgets/
├── chart-library/
│   └── PivotTable.tsx                    # Add sorting UI and logic
├── components/
│   ├── WidgetForm.tsx                    # Add default sort configuration
│   └── DashboardWidget.tsx               # Handle sort state integration
├── utils/
│   └── pivot-table-utils.ts              # Add sorting algorithms
└── hooks/
    └── usePivotTableSort.ts              # NEW: Sort state management
```

### New Files

- `web/src/features/widgets/hooks/usePivotTableSort.ts` - Custom hook for sort state management

## 3. Feature Specification

### 3.1 Default Sort Configuration

**User Story**: As a user creating a pivot table widget, I want to set a default sort so that the data is automatically sorted when the widget loads.

**Implementation Steps**:

1. Extend `WidgetForm.tsx` to include sort configuration dropdowns
2. Add sort configuration to widget schema
3. Store default sort in widget configuration
4. Apply default sort on widget initialization

**Error Handling**:

- Gracefully handle invalid sort configurations
- Provide sensible defaults for missing sort settings
- Maintain backward compatibility with existing widgets

### 3.2 Interactive Column Sorting

**User Story**: As a user viewing a pivot table, I want to click column headers to sort data hierarchically.

**Implementation Steps**:

1. Add click handlers to column headers
2. Implement ASC → DESC → no sort cycle
3. Apply hierarchical sorting (groups first, then items)
4. Update visual indicators (▲/▼ arrows)
5. Persist sort state to session storage

**Error Handling**:

- Handle empty groups gracefully
- Provide fallback for equal values
- Maintain accessibility during sort operations

### 3.3 Session-Based Persistence

**User Story**: As a user, I want my sort preferences to persist during my session.

**Implementation Steps**:

1. Create `usePivotTableSort` hook for state management
2. Integrate with existing session storage patterns
3. Save sort state per widget instance
4. Restore preferences on page reload

**Error Handling**:

- Silently fail if storage is unavailable
- Provide fallback to default sort
- Handle storage quota exceeded scenarios

### 3.4 Server-Side Sorting

**User Story**: As a user, I want sorting to be applied before row limiting to ensure I see the most relevant data.

**Implementation Steps**:

1. Extend query builders to support ORDER BY clauses
2. Modify dashboard services to include sort parameters
3. Apply sorting at database level before row limiting
4. Ensure correct data flow from server to client

**Error Handling**:

- Handle database query errors gracefully
- Provide fallback to client-side sorting
- Maintain performance for large datasets

## 4. Database Schema

### 4.1 Widget Configuration Extension

**Current Schema**:

```typescript
// In packages/shared/src/server/services/DashboardService/types.ts
export const PivotTableChartConfig = BaseTotalValueChartConfig.extend({
  type: z.literal("PIVOT_TABLE"),
});
```

**Extended Schema**:

```typescript
export const PivotTableChartConfig = BaseTotalValueChartConfig.extend({
  type: z.literal("PIVOT_TABLE"),
  defaultSort: z
    .object({
      column: z.string().optional(),
      order: z.enum(["ASC", "DESC"]).optional(),
    })
    .optional(),
});
```

**Database Migration**:

```sql
-- No schema changes required as configuration is stored in JSON field
-- Existing widgets will have null defaultSort, which is handled gracefully
```

## 5. Server Actions

### 5.1 Database Actions

#### Widget Configuration Storage

```typescript
// In web/src/features/widgets/components/WidgetForm.tsx
interface WidgetFormData {
  // ... existing fields
  defaultSort?: {
    column: string;
    direction: "ASC" | "DESC";
  };
}

// Store in existing chartConfig JSON field
const chartConfig = {
  // ... existing config
  defaultSort: defaultSort,
};
```

#### Query Modification for Sorting

```typescript
// In web/src/features/widgets/utils/query-builder.ts
interface SortConfig {
  column: string;
  direction: "ASC" | "DESC";
}

function buildPivotTableQuery(
  // ... existing parameters
  sortConfig?: SortConfig,
) {
  let query = baseQuery;

  if (sortConfig) {
    query += ` ORDER BY ${sortConfig.column} ${sortConfig.direction}`;
  }

  query += ` LIMIT ${rowLimit}`;
  return query;
}
```

### 5.2 Other Actions

#### Session Storage Integration

```typescript
// In web/src/features/widgets/hooks/usePivotTableSort.ts
import { type OrderByState } from "@langfuse/shared";

const STORAGE_KEY = `pivot-table-sort-${widgetId}`;

export function usePivotTableSort(widgetId: string) {
  const [sortState, setSortState] = useState<OrderByState>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const updateSort = useCallback(
    (newSort: OrderByState) => {
      setSortState(newSort);
      try {
        if (newSort) {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newSort));
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // Silently fail
      }
    },
    [widgetId],
  );

  return { sortState, updateSort };
}
```

## 6. Design System

### 6.1 Visual Style

**Color Palette**:

- Sort indicators: `text-muted-foreground` (▲/▼ arrows)
- Hover state: `hover:bg-muted/30` (existing table pattern)
- Active sort: `text-foreground` (highlighted column)

**Typography**:

- Column headers: `text-sm font-medium` (existing pattern)
- Sort indicators: `text-xs` (smaller than header text)

**Component Styling Patterns**:

- Follow existing `data-table.tsx` patterns
- Use `cn()` utility for conditional classes
- Maintain dark theme compatibility

### 6.2 Core Components

#### Sortable Column Header

```typescript
import { type OrderByState } from "@langfuse/shared";

interface SortableHeaderProps {
  column: string;
  label: string;
  sortState: OrderByState;
  onSort: (column: string) => void;
}

function SortableHeader({ column, label, sortState, onSort }: SortableHeaderProps) {
  const isSorted = sortState?.column === column;
  const sortDirection = isSorted ? sortState.order : null;

  return (
    <TableHead
      className={cn(
        "cursor-pointer select-none",
        "hover:bg-muted/30 transition-colors"
      )}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {isSorted && (
          <span className="ml-1">
            {sortDirection === "ASC" ? "▲" : "▼"}
          </span>
        )}
      </div>
    </TableHead>
  );
}
```

## 7. Component Architecture

### 7.1 Server Components

#### WidgetForm (Extended)

```typescript
// In web/src/features/widgets/components/WidgetForm.tsx
interface WidgetFormProps {
  // ... existing props
  initialValues: {
    // ... existing fields
    defaultSort?: {
      column: string;
      direction: "ASC" | "DESC";
    };
  };
}

// Add to form JSX
{selectedChartType === "PIVOT_TABLE" && (
  <div className="space-y-4">
    <div>
      <h4 className="mb-2 text-sm font-semibold">Default Sort</h4>
      <p className="mb-3 text-xs text-muted-foreground">
        Set the default sort order for this pivot table.
      </p>
    </div>

    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="text-xs font-medium">Sort Column</label>
        <Select
          value={defaultSortColumn}
          onValueChange={setDefaultSortColumn}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select column" />
          </SelectTrigger>
          <SelectContent>
            {availableColumns.map(column => (
              <SelectItem key={column} value={column}>
                {formatColumnHeader(column)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-xs font-medium">Sort Direction</label>
        <Select
          value={defaultSortDirection}
          onValueChange={setDefaultSortDirection}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ASC">Ascending</SelectItem>
            <SelectItem value="DESC">Descending</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </div>
)}
```

### 7.2 Client Components

#### PivotTable (Extended)

```typescript
// In web/src/features/widgets/chart-library/PivotTable.tsx
import { type OrderByState } from "@langfuse/shared";

interface PivotTableProps {
  // ... existing props
  sortState?: OrderByState;
  onSortChange?: (sortState: OrderByState) => void;
  defaultSort?: {
    column: string;
    order: "ASC" | "DESC";
  };
}

export const PivotTable: React.FC<PivotTableProps> = ({
  data,
  config,
  sortState,
  onSortChange,
  defaultSort,
}) => {
  const handleSort = useCallback((column: string) => {
    if (!onSortChange) return;

    if (sortState?.column === column) {
      if (sortState.order === "ASC") {
        onSortChange({ column, order: "DESC" });
      } else {
        onSortChange(null); // Remove sort
      }
    } else {
      onSortChange({ column, order: "ASC" });
    }
  }, [sortState, onSortChange]);

  // Apply sorting to pivot table rows
  const sortedRows = useMemo(() => {
    if (!sortState) return pivotTableRows;

    return sortPivotTableRows(pivotTableRows, sortState);
  }, [pivotTableRows, sortState]);

  return (
    <div className="h-full overflow-auto px-5 pb-2">
      <Table>
        <TableHeader>
          <TableRow className="border-b bg-muted/50">
            {/* Dimension column header */}
            <SortableHeader
              column="dimension"
              label={config?.dimensions?.map(formatColumnHeader).join(" / ") || "Dimension"}
              sortState={sortState}
              onSort={handleSort}
            />

            {/* Metric column headers */}
            {metrics.map((metric) => (
              <SortableHeader
                key={metric}
                column={metric}
                label={formatColumnHeader(metric)}
                sortState={sortState}
                onSort={handleSort}
              />
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {sortedRows.map((row) => (
            <PivotTableRowComponent key={row.id} row={row} metrics={metrics} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
```

## 8. Authentication & Authorization

**Current Implementation**:

- Widget access controlled by project-level permissions
- No changes required for authentication
- Existing RBAC patterns apply to pivot table sorting

**Authorization Checks**:

- Widget read access required for viewing sorted data
- Widget write access required for modifying sort preferences
- Project-level permissions apply to all widget operations

## 9. Data Flow

### 9.1 Server/Client Data Passing

```typescript
// Data flow diagram
Widget Config → Server Query → Client Render → User Interaction → Persistence
     ↓              ↓              ↓              ↓              ↓
Default Sort → ORDER BY → PivotTable → Click Handler → Session Storage
```

### 9.2 State Management Architecture

```typescript
// State management flow
import { type OrderByState } from "@langfuse/shared";

// Widget level
const { sortState, updateSort } = usePivotTableSort(widgetId);

// Component level
const [localSortState, setLocalSortState] = useState<OrderByState>(
  defaultSort || null,
);

// Integration
useEffect(() => {
  if (sortState) {
    setLocalSortState(sortState);
  }
}, [sortState]);
```

## 10. Testing

### 10.1 Unit Tests

#### Sorting Logic Tests

```typescript
// In web/src/__tests__/pivot-table-sorting.test.ts
describe("Pivot Table Sorting", () => {
  test("sorts groups by total values first", () => {
    const rows = [
      { type: "subtotal", label: "Group B", values: { count: 50 } },
      { type: "subtotal", label: "Group A", values: { count: 100 } },
      { type: "data", label: "Item 1", values: { count: 30 } },
    ];

    const sorted = sortPivotTableRows(rows, {
      column: "count",
      order: "DESC",
    });

    expect(sorted[0].label).toBe("Group A");
    expect(sorted[1].label).toBe("Group B");
  });

  test("sorts items within groups", () => {
    const rows = [
      { type: "subtotal", label: "Group A", values: { count: 100 } },
      { type: "data", label: "Item 2", values: { count: 30 } },
      { type: "data", label: "Item 1", values: { count: 70 } },
    ];

    const sorted = sortPivotTableRows(rows, {
      column: "count",
      order: "DESC",
    });

    expect(sorted[1].label).toBe("Item 1");
    expect(sorted[2].label).toBe("Item 2");
  });
});
```

#### Persistence Tests

```typescript
describe("Sort Persistence", () => {
  test("saves sort state to session storage", () => {
    const mockSetItem = jest.spyOn(sessionStorage, "setItem");

    const { updateSort } = renderHook(() => usePivotTableSort("test-widget"));

    updateSort({ column: "count", order: "DESC" });

    expect(mockSetItem).toHaveBeenCalledWith(
      "pivot-table-sort-test-widget",
      JSON.stringify({ column: "count", order: "DESC" }),
    );
  });

  test("restores sort state from session storage", () => {
    const mockGetItem = jest.spyOn(sessionStorage, "getItem");
    mockGetItem.mockReturnValue(
      JSON.stringify({ column: "count", order: "ASC" }),
    );

    const { result } = renderHook(() => usePivotTableSort("test-widget"));

    expect(result.current.sortState).toEqual({
      column: "count",
      order: "ASC",
    });
  });
});
```
