# Pivot Table Widget Technical Specification

## 1. System Overview

### Core Purpose and Value Proposition

The Pivot Table widget extends Langfuse's self-serve dashboard capabilities by providing tabular data visualization with grouping and aggregation. Users can create tables with 0-N row dimensions (currently limited to 2) and multiple metrics, enabling detailed data analysis that complements existing chart visualizations.

### Database Architecture

- **PostgreSQL**: Primary database for widget configuration, dashboard definitions, and user data (via Prisma ORM)
- **ClickHouse**: Analytics database for high-volume trace, observation, and score data used by widgets for querying

### Key Workflows

1. **Widget Configuration**: User selects dimensions and metrics through dropdown interface
2. **Query Generation**: QueryBuilder generates SQL with appropriate GROUP BY clauses
3. **Data Processing**: Raw query results transformed into nested table structure with totals
4. **Rendering**: PivotTable component displays formatted table with indentation and styling

### System Architecture

```
WidgetForm (Config) → QueryBuilder (SQL) → ClickHouse (Analytics Data) →
DataTransformer (Processing) → PivotTable (Render) → Dashboard Grid
```

## 2. Project Structure

```
web/src/features/widgets/
├── chart-library/
│   ├── PivotTable.tsx          # New pivot table component
│   ├── Chart.tsx                     # Updated to route PIVOT_TABLE
│   └── utils.ts                      # Updated chart type utilities
├── components/
│   ├── WidgetForm.tsx               # Updated with dimension selectors
│   └── WidgetPropertySelectItem.tsx # Reused for dimension selection
└── utils/
    └── pivot-table-utils.ts   # New data transformation utilities and constants

packages/shared/prisma/
├── migrations/
│   └── add_pivot_table_type.sql # PostgreSQL migration
└── schema.prisma                     # Updated enum

web/src/features/dashboard/server/
└── dashboard-router.ts               # Updated executeQuery function

web/src/features/query/
├── types.ts                         # Updated QueryType interface
└── server/queryBuilder.ts           # Enhanced for aggregation queries
```

## 3. Feature Specification

### 3.1 Chart Type Registration

**User Story**: As a user, I can select "Pivot Table" from the chart type dropdown when creating widgets.

**Implementation Steps**:

1. Add `PIVOT_TABLE` to DashboardWidgetChartType enum
2. Update chart type mappings in utils.ts
3. Add pivot table to chart type selector UI
4. Update Chart.tsx routing logic

**Error Handling**:

- Fallback to horizontal bar chart if PIVOT_TABLE not recognized
- Display configuration error if invalid chart config provided

### 3.2 Dimension Configuration Interface

**User Story**: As a user, I can configure 0-N row dimensions for my pivot table (currently limited to 2 dimensions).

**Implementation Steps**:

1. Define `MAX_DIMENSIONS` constant (set to 2 for initial implementation)
2. Create dynamic dimension selector array based on `MAX_DIMENSIONS`
3. Add conditional logic for showing/hiding dimension selectors
4. Update form validation logic to handle variable dimension count
5. Integrate with existing dimension options from viewDeclarations

**Error Handling**:

- Disable subsequent dimension selectors if previous ones not selected
- Clear dependent dimension selectors when parent dimensions are cleared
- Validate dimension compatibility with selected view
- Enforce `MAX_DIMENSIONS` limit in UI

### 3.3 Data Transformation Engine

**User Story**: As a system, I need to transform flat query results into nested table structure.

**Implementation Steps**:

1. Create `transformToPivotTable()` function with configurable dimension support
2. Handle 0 to `MAX_DIMENSIONS` scenarios dynamically
3. Generate subtotals for each dimension level (currently first dimension only)
4. Calculate grand totals across all data
5. Apply top 20 row limit before adding totals
6. Support future expansion beyond 2 dimensions

**Error Handling**:

- Handle empty datasets gracefully
- Manage null/undefined dimension values
- Prevent division by zero in calculations

### 3.4 Table Rendering Component

**User Story**: As a user, I see my data displayed in a properly formatted pivot table.

**Implementation Steps**:

1. Create PivotTable React component with configurable dimension support
2. Implement dynamic indentation based on dimension level (currently up to 2 levels)
3. Add bold styling for total rows at each dimension level
4. Handle responsive layout within dashboard grid
5. Display empty cells for missing data
6. Design component to scale with future dimension increases

**Error Handling**:

- Graceful degradation for malformed data
- Loading and error states
- Overflow handling for wide tables

## 4. Database Schema

### 4.1 Migration

```sql
-- Add PIVOT_TABLE to existing enum in PostgreSQL
ALTER TYPE "DashboardWidgetChartType" ADD VALUE 'PIVOT_TABLE';
```

### 4.2 Existing Tables (No Changes)

The existing `DashboardWidget` table in PostgreSQL remains unchanged:

```sql
CREATE TABLE "dashboard_widgets" (
    "id" TEXT NOT NULL,
    -- ... existing fields
    "chart_type" "DashboardWidgetChartType" NOT NULL,
    "chart_config" JSONB NOT NULL,
    -- ... other fields
);
```

**Chart Config Schema for Pivot Tables**:

```typescript
// Configuration constants
const MAX_DIMENSIONS = 2; // Currently limited to 2, easily configurable for future expansion

interface PivotTableConfig {
  type: "PIVOT_TABLE";
  dimensions: string[]; // Array of dimension names (max length = MAX_DIMENSIONS)
  row_limit?: number; // Fixed at 20 for pivot tables
}
```

## 5. Server Actions

### 5.1 Database Actions

#### Enhanced executeQuery Function

```typescript
// File: web/src/features/dashboard/server/dashboard-router.ts
export async function executeQuery(
  projectId: string,
  query: QueryType,
): Promise<Array<Record<string, unknown>>> {
  // Existing implementation enhanced to handle pivot table queries
  const { query: compiledQuery, parameters } = new QueryBuilder(
    query.chartConfig,
  ).build(query, projectId);

  // Execute query and return results
}
```

**Input Parameters**:

- `projectId`: string
- `query`: QueryType with dimensions array and metrics array

**Return Value**: Array of database rows with dimension and metric columns

#### Data Transformation Function

```typescript
// File: web/src/features/widgets/utils/pivot-table-utils.ts
export interface PivotTableRow {
  type: "data" | "subtotal" | "total";
  level: 0 | 1; // Indentation level
  label: string;
  values: Record<string, number | string>;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

export function transformToPivotTable(
  data: DatabaseRow[],
  config: {
    dimensions: string[]; // Array of dimension names (max MAX_DIMENSIONS)
    metrics: string[];
    rowLimit: number;
  },
): PivotTableRow[];
```

### 5.2 Query Builder Enhancement

#### Updated QueryBuilder Class

```typescript
// File: web/src/features/query/server/queryBuilder.ts
class QueryBuilder {
  build(
    query: QueryType,
    projectId: string,
  ): {
    query: string;
    parameters: Record<string, unknown>;
  } {
    // Enhanced to handle multiple dimensions for pivot tables
    // Generate appropriate GROUP BY clauses
    // Apply ORDER BY for proper grouping
  }
}
```

## 6. Design System

### 6.1 Visual Style

**Colors** (using existing Langfuse palette):

- Table borders: `border-border` (CSS variable)
- Header background: `bg-muted/50`
- Subtotal rows: `bg-muted/30`
- Total rows: `bg-muted/50`
- Text: `text-foreground`, `text-muted-foreground`

**Typography**:

- Headers: `text-sm font-medium`
- Data cells: `text-sm`
- Subtotal/Total rows: `text-sm font-semibold`

**Spacing**:

- Cell padding: `p-2`
- Row height: `min-h-[2.5rem]`
- Indentation: `pl-6` for second-level rows

### 6.2 Core Components

#### Table Layout Structure

```tsx
<div className="overflow-auto">
  <table className="w-full border-collapse">
    <thead>
      <tr className="border-b bg-muted/50">
        <th className="text-left p-2 font-medium">Dimension</th>
        {metrics.map((metric) => (
          <th key={metric} className="text-right p-2 font-medium">
            {metric}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <PivotTableRow key={row.id} row={row} />
      ))}
    </tbody>
  </table>
</div>
```

#### Row Component Styling

```tsx
<tr
  className={cn(
    "border-b hover:bg-muted/30",
    row.isSubtotal && "bg-muted/30",
    row.isTotal && "bg-muted/50",
  )}
>
  <td
    className={cn(
      "p-2",
      row.level === 1 && "pl-6", // Indentation
      (row.isSubtotal || row.isTotal) && "font-semibold",
    )}
  >
    {row.label}
  </td>
  {/* Metric columns */}
</tr>
```

## 7. Component Architecture

### 7.1 Server Components

**Data Fetching**: Reuse existing `api.dashboard.executeQuery` TRPC query

**Error Boundaries**: Utilize existing dashboard error handling patterns

### 7.2 Client Components

#### PivotTable Component

```typescript
// File: web/src/features/widgets/chart-library/PivotTable.tsx
interface PivotTableProps {
  data: DataPoint[];
  config?: {
    dimensions?: string[]; // Array of dimension names
    rowLimit?: number;
  };
}

export const PivotTable: React.FC<PivotTableProps> = ({
  data,
  config = { rowLimit: 20 }
}) => {
  const processedData = useMemo(() =>
    transformToPivotTable(data, config), [data, config]
  );

  return (
    <div className="h-full overflow-auto">
      {/* Table implementation */}
    </div>
  );
};
```

#### Enhanced WidgetForm Component

```typescript
// File: web/src/features/widgets/components/WidgetForm.tsx
// Configuration constants
const MAX_DIMENSIONS = 2; // Easily configurable for future expansion

// Add state for dimensions array
const [dimensions, setDimensions] = useState<string[]>([]);

// Helper function to update dimension at specific index
const updateDimension = (index: number, value: string) => {
  const newDimensions = [...dimensions];
  if (value) {
    newDimensions[index] = value;
  } else {
    // Clear this dimension and all subsequent ones
    newDimensions.splice(index);
  }
  setDimensions(newDimensions);
};

// Add dimension selectors to form
{selectedChartType === "PIVOT_TABLE" && (
  <>
    {Array.from({ length: MAX_DIMENSIONS }, (_, index) => {
      const isEnabled = index === 0 || dimensions[index - 1]; // Enable if first or previous is selected
      const selectedDimensions = dimensions.slice(0, index); // Exclude current and later dimensions

      return (
        <DimensionSelector
          key={index}
          label={`Dimension ${index + 1} (Optional)`}
          value={dimensions[index] || ""}
          onChange={(value) => updateDimension(index, value)}
          options={availableDimensions.filter(d => !selectedDimensions.includes(d.value))}
          disabled={!isEnabled}
        />
      );
    })}
  </>
)}
```

#### Updated Chart Component

```typescript
// File: web/src/features/widgets/chart-library/Chart.tsx
const renderChart = () => {
  switch (chartType) {
    // ... existing cases
    case "PIVOT_TABLE":
      return <PivotTable data={renderedData} config={chartConfig} />;
    default:
      return <HorizontalBarChart data={renderedData.slice(0, rowLimit)} />;
  }
};
```

## 8. Authentication & Authorization

**Implementation**: Reuse existing RBAC system

- Widget creation requires `dashboards:CUD` scope
- Widget viewing requires `dashboards:read` scope
- No additional permissions needed

## 9. Data Flow

### State Management Architecture

```
User Input (WidgetForm)
  ↓ [selectedDimensions, selectedMetrics]
Query Configuration (TRPC)
  ↓ [QueryType object]
QueryBuilder (Server)
  ↓ [SQL query]
ClickHouse Database (Analytics Data)
  ↓ [Raw results]
Data Transformer (Server)
  ↓ [Processed table structure]
AggregationTable Component
  ↓ [Rendered table]
```

### Error Handling Flow

```
Database Error → TRPC Error → Loading State → Error Display
Transformation Error → Fallback Data → Warning Message
Render Error → Error Boundary → Fallback UI
```

## 10. Testing

### Unit Tests (Jest)

**Location**: `web/src/__tests__/`

```typescript
// web/src/__tests__/pivot-table-utils.clienttest.ts
describe("transformToPivotTable", () => {
  test("handles zero dimensions correctly", () => {
    const data = [{ count: 100, avg_value: 50 }];
    const result = transformToPivotTable(data, {
      metrics: ["count", "avg_value"],
    });
    expect(result).toEqual([
      {
        type: "total",
        level: 0,
        label: "Total",
        values: { count: 100, avg_value: 50 },
      },
    ]);
  });

  test("handles single dimension with subtotals", () => {
    // Test single dimension grouping
  });

  test("handles multiple dimensions with nested structure", () => {
    // Test nested grouping with indentation up to MAX_DIMENSIONS
  });

  test("applies row limit correctly", () => {
    // Test top 20 limitation
  });

  test("respects MAX_DIMENSIONS configuration", () => {
    // Test that dimension count is properly limited
  });
});

// web/src/__tests__/pivot-table.clienttest.ts
describe("PivotTable Component", () => {
  test("renders table with correct structure", () => {
    // Test component rendering
  });

  test("applies correct styling for subtotal rows", () => {
    // Test CSS classes
  });

  test("handles empty data gracefully", () => {
    // Test edge cases
  });
});
```

**Test Commands**:

```sh
# Run sync tests (client-side component tests)
pnpm test-sync --testPathPattern="pivot-table"

# Run async tests (server-side API tests)
pnpm test-async --testPathPattern="dashboard-router"
```

### Integration Tests

**Location**: `web/src/__tests__/`

```typescript
// web/src/__tests__/dashboard-router-pivot-table.servertest.ts
test("executeQuery handles pivot table queries", async () => {
  // Test query builder integration
  // Verify SQL generation for multiple dimensions
  // Check data transformation pipeline
});
```

This specification provides comprehensive technical guidance for implementing the Pivot Table widget, ensuring it integrates seamlessly with the existing Langfuse dashboard system while maintaining code quality and user experience standards.
