# Aggregation Table Widget Technical Specification

## 1. System Overview

### Core Purpose and Value Proposition

The Aggregation Table widget extends Langfuse's self-serve dashboard capabilities by providing tabular data visualization with grouping and aggregation. Users can create tables with 0-2 row dimensions and multiple metrics, enabling detailed data analysis that complements existing chart visualizations.

### Database Architecture

- **PostgreSQL**: Primary database for widget configuration, dashboard definitions, and user data (via Prisma ORM)
- **ClickHouse**: Analytics database for high-volume trace, observation, and score data used by widgets for querying

### Key Workflows

1. **Widget Configuration**: User selects dimensions and metrics through dropdown interface
2. **Query Generation**: QueryBuilder generates SQL with appropriate GROUP BY clauses
3. **Data Processing**: Raw query results transformed into nested table structure with totals
4. **Rendering**: AggregationTable component displays formatted table with indentation and styling

### System Architecture

```
WidgetForm (Config) → QueryBuilder (SQL) → ClickHouse (Analytics Data) →
DataTransformer (Processing) → AggregationTable (Render) → Dashboard Grid
```

## 2. Project Structure

```
web/src/features/widgets/
├── chart-library/
│   ├── AggregationTable.tsx          # New aggregation table component
│   ├── Chart.tsx                     # Updated to route AGGREGATION_TABLE
│   └── utils.ts                      # Updated chart type utilities
├── components/
│   ├── WidgetForm.tsx               # Updated with dimension selectors
│   └── WidgetPropertySelectItem.tsx # Reused for dimension selection
└── utils/
    └── aggregation-table-utils.ts   # New data transformation utilities

packages/shared/prisma/
├── migrations/
│   └── add_aggregation_table_type.sql # PostgreSQL migration
└── schema.prisma                     # Updated enum

web/src/features/dashboard/server/
└── dashboard-router.ts               # Updated executeQuery function

web/src/features/query/
├── types.ts                         # Updated QueryType interface
└── server/queryBuilder.ts           # Enhanced for aggregation queries
```

## 3. Feature Specification

### 3.1 Chart Type Registration

**User Story**: As a user, I can select "Aggregation Table" from the chart type dropdown when creating widgets.

**Implementation Steps**:

1. Add `AGGREGATION_TABLE` to DashboardWidgetChartType enum
2. Update chart type mappings in utils.ts
3. Add aggregation table to chart type selector UI
4. Update Chart.tsx routing logic

**Error Handling**:

- Fallback to horizontal bar chart if AGGREGATION_TABLE not recognized
- Display configuration error if invalid chart config provided

### 3.2 Dimension Configuration Interface

**User Story**: As a user, I can configure 0-2 row dimensions for my aggregation table.

**Implementation Steps**:

1. Add first dimension selector to WidgetForm (optional)
2. Add second dimension selector (conditional on first being selected)
3. Update form validation logic
4. Integrate with existing dimension options from viewDeclarations

**Error Handling**:

- Disable second dimension if first not selected
- Clear second dimension if first is cleared
- Validate dimension compatibility with selected view

### 3.3 Data Transformation Engine

**User Story**: As a system, I need to transform flat query results into nested table structure.

**Implementation Steps**:

1. Create `transformToAggregationTable()` function
2. Handle 0, 1, and 2 dimension scenarios
3. Generate subtotals for first dimension groups
4. Calculate grand totals across all data
5. Apply top 20 row limit before adding totals

**Error Handling**:

- Handle empty datasets gracefully
- Manage null/undefined dimension values
- Prevent division by zero in calculations

### 3.4 Table Rendering Component

**User Story**: As a user, I see my data displayed in a properly formatted aggregation table.

**Implementation Steps**:

1. Create AggregationTable React component
2. Implement indentation for second-level rows
3. Add bold styling for total rows
4. Handle responsive layout within dashboard grid
5. Display empty cells for missing data

**Error Handling**:

- Graceful degradation for malformed data
- Loading and error states
- Overflow handling for wide tables

## 4. Database Schema

### 4.1 Migration

```sql
-- Add AGGREGATION_TABLE to existing enum in PostgreSQL
ALTER TYPE "DashboardWidgetChartType" ADD VALUE 'AGGREGATION_TABLE';
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

**Chart Config Schema for Aggregation Tables**:

```typescript
interface AggregationTableConfig {
  type: "AGGREGATION_TABLE";
  firstDimension?: string;
  secondDimension?: string;
  row_limit?: number; // Fixed at 20 for aggregation tables
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
  // Existing implementation enhanced to handle aggregation table queries
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
// File: web/src/features/widgets/utils/aggregation-table-utils.ts
export interface AggregationTableRow {
  type: "data" | "subtotal" | "total";
  level: 0 | 1; // Indentation level
  label: string;
  values: Record<string, number | string>;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

export function transformToAggregationTable(
  data: DatabaseRow[],
  config: {
    firstDimension?: string;
    secondDimension?: string;
    metrics: string[];
    rowLimit: number;
  },
): AggregationTableRow[];
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
    // Enhanced to handle multiple dimensions for aggregation tables
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
        <AggregationTableRow key={row.id} row={row} />
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

#### AggregationTable Component

```typescript
// File: web/src/features/widgets/chart-library/AggregationTable.tsx
interface AggregationTableProps {
  data: DataPoint[];
  config?: {
    firstDimension?: string;
    secondDimension?: string;
    rowLimit?: number;
  };
}

export const AggregationTable: React.FC<AggregationTableProps> = ({
  data,
  config = { rowLimit: 20 }
}) => {
  const processedData = useMemo(() =>
    transformToAggregationTable(data, config), [data, config]
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
// Add state for dimensions
const [firstDimension, setFirstDimension] = useState<string>("");
const [secondDimension, setSecondDimension] = useState<string>("");

// Add dimension selectors to form
{selectedChartType === "AGGREGATION_TABLE" && (
  <>
    <DimensionSelector
      label="First Dimension (Optional)"
      value={firstDimension}
      onChange={setFirstDimension}
      options={availableDimensions}
    />
    {firstDimension && (
      <DimensionSelector
        label="Second Dimension (Optional)"
        value={secondDimension}
        onChange={setSecondDimension}
        options={availableDimensions.filter(d => d.value !== firstDimension)}
      />
    )}
  </>
)}
```

#### Updated Chart Component

```typescript
// File: web/src/features/widgets/chart-library/Chart.tsx
const renderChart = () => {
  switch (chartType) {
    // ... existing cases
    case "AGGREGATION_TABLE":
      return <AggregationTable data={renderedData} config={chartConfig} />;
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
// web/src/__tests__/aggregation-table-utils.clienttest.ts
describe("transformToAggregationTable", () => {
  test("handles zero dimensions correctly", () => {
    const data = [{ count: 100, avg_value: 50 }];
    const result = transformToAggregationTable(data, {
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

  test("handles two dimensions with nested structure", () => {
    // Test nested grouping with indentation
  });

  test("applies row limit correctly", () => {
    // Test top 20 limitation
  });
});

// web/src/__tests__/aggregation-table.clienttest.ts
describe("AggregationTable Component", () => {
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
pnpm test-sync --testPathPattern="aggregation-table"

# Run async tests (server-side API tests)
pnpm test-async --testPathPattern="dashboard-router"
```

### Integration Tests

**Location**: `web/src/__tests__/`

```typescript
// web/src/__tests__/dashboard-router-aggregation-table.servertest.ts
test("executeQuery handles aggregation table queries", async () => {
  // Test query builder integration
  // Verify SQL generation for multiple dimensions
  // Check data transformation pipeline
});
```

This specification provides comprehensive technical guidance for implementing the Aggregation Table widget, ensuring it integrates seamlessly with the existing Langfuse dashboard system while maintaining code quality and user experience standards.
