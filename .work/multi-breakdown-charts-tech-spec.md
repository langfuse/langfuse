# Multi-Breakdown Charts Technical Specification

## 1. System Overview

### Core Purpose and Value Proposition

**Unify dimension selection across all chart types** by removing the artificial distinction between "breakdown dimensions" and "pivot table dimensions". All charts that support dimensions should use the same dimension selection UI and logic, with only the rendering differing based on chart type.

### Key Workflows

1. **Unified Dimension Selection**: All chart types use same dimension selection UI (up to N dimensions)
2. **Chart-Agnostic Query Generation**: Single query building logic works for all chart types
3. **Unified Data Processing**: Same data transformation pipeline for all charts
4. **Chart-Specific Rendering**: Each chart type auto-detects dimension count and renders appropriately:
   - Pivot tables: Rows with subtotals
   - Bar charts: Grouped bars
   - Pie charts: Nested donuts
   - Line charts: Multiple series with patterns
5. **Unified Export**: Same export logic works for all multi-dimensional charts

### System Architecture

- **Frontend**: Unified WidgetForm with single dimension selection UI for all chart types
- **Backend**: Existing QueryBuilder already supports multi-dimensional queries (no changes needed)
- **Data Flow**: Unified pipeline → Chart auto-detection → Chart-specific rendering
- **Backward Compatibility**: All existing charts and widgets continue working unchanged

## 2. Project Structure

### File Organization

```
web/src/features/widgets/
├── components/
│   ├── WidgetForm.tsx                    # MODIFY: Unify dimension UI (remove selectedDimension)
│   └── DashboardWidget.tsx               # NO CHANGE: Already handles dimensions array
├── chart-library/
│   ├── chart-props.ts                    # MODIFY: Extend DataPoint interface for dimensions array
│   ├── utils.ts                          # MODIFY: Multi-dimension data processing utilities
│   ├── Chart.tsx                         # NO CHANGE: Chart routing remains the same
│   ├── HorizontalBarChart.tsx            # MODIFY: Auto-detect and render grouped bars
│   ├── VerticalBarChart.tsx              # MODIFY: Auto-detect and render grouped bars
│   ├── PieChart.tsx                      # MODIFY: Auto-detect and render nested donut
│   ├── VerticalBarChartTimeSeries.tsx    # MODIFY: Auto-detect multi-dimension time series
│   └── LineChartTimeSeries.tsx           # PHASE 2: Auto-detect multi-dimension line charts
└── utils/
    └── dimension-utils.ts                # CREATE: Generic dimension utility functions
```

### Key Simplifications

- ✅ **No separate multi-breakdown types** - extend existing interfaces
- ✅ **No chart routing changes** - existing Chart.tsx works unchanged
- ✅ **No separate UI components** - reuse existing dimension selection pattern
- ✅ **Minimal file changes** - most changes are enhancements to existing files

### Dependencies

- **No New External Dependencies**: Use existing Recharts, TypeScript, Zod v4
- **Internal Dependencies**: Extend existing query, widget, and chart systems

## 3. Feature Specification

### 3.1 Multi-Dimension Widget Configuration

**User Story**: As a user, I want to select up to 2 breakdown dimensions so I can analyze data across multiple categorical variables simultaneously.

**Aligned with Existing Pivot Table Pattern**:

1. **Unified Dimension Management** (`WidgetForm.tsx`) - Remove artificial distinction:

   ```typescript
   // Remove selectedDimension (legacy single dimension)
   // Remove breakdownDimensions (unnecessary parallel state)
   // Use SINGLE dimensions array for ALL chart types

   // Unified dimensions state (works for all chart types)
   const [dimensions, setDimensions] = useState<string[]>(
     initialValues.dimensions?.length
       ? // Initialize from existing dimensions data (editing mode)
         initialValues.dimensions.map((dim) => dim.field)
       : // Default to empty array (new widget)
         [],
   );

   // Single helper function for ALL chart types (not just pivots)
   const updateDimension = (index: number, value: string) => {
     const newDimensions = [...dimensions];
     if (value && value !== "none") {
       newDimensions[index] = value;
     } else {
       newDimensions.splice(index); // Clear this and subsequent dimensions
     }
     setDimensions(newDimensions);
   };

   // Same constant for all chart types (not just pivots)
   const MAX_DIMENSIONS = 2; // Can be increased to 3+ in future
   ```

2. **Unified Form Layout** - Single dimension UI for ALL chart types:

   ```jsx
   {
     /* Unified Dimensions - ALL chart types use same UI */
   }
   {
     chartTypes.find((c) => c.value === selectedChartType)
       ?.supportsBreakdown && (
       <div className="space-y-4">
         <div>
           <h4 className="mb-2 text-sm font-semibold">
             {selectedChartType === "PIVOT_TABLE"
               ? "Row Dimensions"
               : "Breakdown Dimensions"}
           </h4>
           <p className="mb-3 text-xs text-muted-foreground">
             Configure up to {MAX_DIMENSIONS} dimensions for{" "}
             {selectedChartType === "PIVOT_TABLE"
               ? "pivot table rows with subtotals"
               : "chart breakdowns"}
             .
           </p>
         </div>

         {Array.from({ length: MAX_DIMENSIONS }, (_, index) => {
           const isEnabled = index === 0 || dimensions[index - 1]; // Enable if first or previous is selected
           const selectedDimensions = dimensions.slice(0, index); // Exclude current and later
           const currentValue = dimensions[index] || "";

           return (
             <div key={index} className="space-y-2">
               <Label htmlFor={`dimension-${index}`}>
                 Dimension {index + 1} (Optional)
               </Label>
               <Select
                 value={currentValue}
                 onValueChange={(value) => updateDimension(index, value)}
                 disabled={!isEnabled}
               >
                 <SelectTrigger id={`dimension-${index}`}>
                   <SelectValue
                     placeholder={
                       isEnabled
                         ? "Select a dimension"
                         : "Select previous dimension first"
                     }
                   />
                 </SelectTrigger>
                 <SelectContent>
                   {index >= 0 && <SelectItem value="none">None</SelectItem>}
                   {availableDimensions
                     .filter((d) => !selectedDimensions.includes(d.value))
                     .map((dimension) => {
                       const meta =
                         viewDeclarations[selectedView]?.dimensions?.[
                           dimension.value
                         ];
                       return (
                         <WidgetPropertySelectItem
                           key={dimension.value}
                           value={dimension.value}
                           label={dimension.label}
                           description={meta?.description}
                           unit={meta?.unit}
                           type={meta?.type}
                         />
                       );
                     })}
                 </SelectContent>
               </Select>
             </div>
           );
         })}
       </div>
     );
   }
   ```

3. **Unified Save Logic** - Single approach for ALL chart types:

   ```typescript
   // In onSave function - MUCH simpler!
   dimensions: dimensions.map((field) => ({ field })),

   // No more chart-type-specific logic needed!
   // Works for:
   // - Pivot tables: [{ field: "environment" }, { field: "model" }]
   // - Bar charts: [{ field: "environment" }, { field: "model" }]
   // - Pie charts: [{ field: "environment" }, { field: "model" }]
   // - Single dimension: [{ field: "environment" }]
   // - No dimensions: []
   ```

4. **Unified Query Building** - Eliminates chart-type-specific logic:

   ```typescript
   // BEFORE (Complex chart-type branching)
   const queryDimensions =
     selectedChartType === "PIVOT_TABLE"
       ? pivotDimensions.map((field) => ({ field }))
       : selectedDimension !== "none"
         ? [{ field: selectedDimension }]
         : [];

   // AFTER (Simple and unified)
   const queryDimensions = dimensions.map((field) => ({ field }));

   // Works for ALL chart types! Query building is now chart-agnostic.
   ```

5. **Unified Data Transformation** - Single data processing pipeline:

   ```typescript
   // BEFORE (Chart-type-specific data transformation)
   if (selectedChartType === "PIVOT_TABLE") {
     return { ...item, dimension: pivotDimensions[0] };
   } else {
     return { dimension: item[selectedDimension], metric: item[metricField] };
   }

   // AFTER (Unified transformation) - Always arrays!
   return {
     dimensions: dimensions.map((dim) => item[dim]), // Always array, even single: ["production"]
     metric: item[metricField],
     time_dimension: item["time_dimension"],
   };
   ```

**Benefits of Unified Approach**:

- ✅ **Single source of truth**: One `dimensions` array for all chart types
- ✅ **Eliminates duplication**: No separate `selectedDimension` vs `pivotDimensions` logic
- ✅ **Consistent UX**: Same dimension selection interface for all charts
- ✅ **Simplified code**: No chart-type-specific branching in save/load/query logic
- ✅ **Easy extensibility**: Change `MAX_DIMENSIONS` to support 3+ dimensions for all charts
- ✅ **Conceptual clarity**: Dimensions are dimensions, regardless of chart type

### 3.2 Enhanced Data Processing

**User Story**: As a system, I need to process multi-dimensional query results into chart-ready data structures.

**Detailed Implementation Steps**:

1. **Unified DataPoint Interface** (`chart-props.ts`) - Single interface for all charts:

   ```typescript
   export interface DataPoint {
     time_dimension: string | undefined;
     dimensions: string[]; // Always array! Single dimension: ["environment"]
     metric: number | Array<Array<number>>;

     // Optional computed fields (auto-generated during data processing)
     combinedDimension?: string; // "dim1|dim2" key for grouping
   }

   // Perfect conceptual clarity:
   // - Single dimension: dimensions = ["environment"]
   // - Multi-dimension: dimensions = ["environment", "model"]
   // - No dimensions: dimensions = []
   ```

   **Why This Is Much Better**:
   - ✅ **Conceptually pure** - dimensions are always an array, no legacy baggage
   - ✅ **Single source of truth** - no confusion between `dimension` vs `dimensions`
   - ✅ **Consistent with pivot tables** - they already use arrays
   - ✅ **No migration needed** - DataPoint is in-memory only, not stored in DB
   - ✅ **Future-proof** - easily scales to 3+ dimensions

2. **Multi-Dimension Utility Functions** (`utils/dimension-utils.ts`) - Generic and extensible:

   ```typescript
   // Generic function that works with any number of dimensions
   export const createCombinedDimensionKey = (dimensions: string[]): string => {
     return dimensions.filter((d) => d).join("|") || "Unknown";
   };

   export const parseCombinedDimensionKey = (combinedKey: string): string[] => {
     return combinedKey.split("|").filter((part) => part.trim() !== "");
   };

   export const enrichDataWithDimensions = (data: DataPoint[]): DataPoint[] => {
     return data.map((item) => ({
       ...item,
       combinedDimension: createCombinedDimensionKey(item.dimensions),
     }));
   };

   // Utility to get dimension count from data (mirrors pivot table logic)
   export const getDimensionCount = (data: DataPoint[]): number => {
     if (!data.length) return 0;
     const firstItem = data[0];
     return firstItem.dimensions?.length || (firstItem.dimension ? 1 : 0);
   };
   ```

3. **Enhanced Data Grouping** (`chart-library/utils.ts`) - Reuses pivot table patterns:

   ```typescript
   // Generic grouping that works with any number of dimensions
   export const groupDataByMultiDimension = (
     data: DataPoint[],
     isTimeSeries: boolean = false,
   ) => {
     if (isTimeSeries) {
       return groupTimeSeriesDataByMultiDimension(data);
     }

     // Group by combined dimension key (similar to pivot table grouping)
     const grouped = data.reduce(
       (acc, item) => {
         const key = item.combinedDimension;
         if (!acc[key]) {
           acc[key] = {
             combinedDimension: key,
             dimensions: item.dimensions,
             dimensionValues: item.dimensionValues,
             metric: 0,
           };
         }
         acc[key].metric += item.metric as number;
         return acc;
       },
       {} as Record<string, any>,
     );

     return Object.values(grouped);
   };

   const groupTimeSeriesDataByMultiDimension = (data: DataPoint[]) => {
     // Time series grouping (similar to pivot table time handling)
     const timeGroups = data.reduce(
       (acc, item) => {
         const time = item.time_dimension || "Unknown";
         const dimKey = item.combinedDimension;

         if (!acc[time]) {
           acc[time] = {};
         }

         acc[time][dimKey] = item.metric as number;
         return acc;
       },
       {} as Record<string, Record<string, number>>,
     );

     return Object.entries(timeGroups).map(([time, dimensions]) => ({
       time_dimension: time,
       ...dimensions,
     }));
   };

   // Helper function for dynamic dimension processing (extensible)
   export const processDataForChartType = (
     data: DataPoint[],
     chartType: DashboardWidgetChartType,
   ) => {
     const dimensionCount = data[0]?.dimensions?.length || 0;

     switch (chartType) {
       case "HORIZONTAL_BAR":
       case "VERTICAL_BAR":
         return dimensionCount > 1 ? groupDataForGroupedBars(data) : data;
       case "PIE":
         return dimensionCount > 1 ? processNestedDonutData(data) : data;
       case "LINE_TIME_SERIES":
       case "BAR_TIME_SERIES":
         return groupTimeSeriesDataByMultiDimension(data);
       default:
         return groupDataByMultiDimension(data);
     }
   };
   ```

**Error Handling and Edge Cases**:

- Handle missing dimension values ("Unknown" fallback)
- Support backward compatibility with single-dimension data
- Validate dimension array lengths
- Handle empty or null dimension arrays

### 3.3 Chart-Specific Rendering

#### 3.3.1 Extended Bar Charts (In-Place Enhancement)

**User Story**: As a user, I want existing bar charts to automatically support grouped bars when I select multiple breakdown dimensions.

**Implementation** - Extend existing `VerticalBarChart.tsx` and `HorizontalBarChart.tsx`:

```typescript
export const VerticalBarChart: React.FC<ChartProps> = ({ data, config }) => {
  // Detect dimension count and choose rendering approach
  const dimensionCount = useMemo(() => {
    return getDimensionCount(data);
  }, [data]);

  const processedData = useMemo(() => {
    if (dimensionCount > 1) {
      const multiDimData = enrichDataWithDimensions(data);
      return groupDataForGroupedBars(multiDimData);
    } else {
      // Existing single-dimension logic (unchanged)
      return data.map((item, index) => ({
        name: item.dimension || "Unknown",
        value: item.metric,
        fill: `hsl(var(--chart-${(index % 4) + 1}))`,
      }));
    }
  }, [data, dimensionCount]);

  const groupDataForGroupedBars = (data: DataPoint[]) => {
    // Group by first dimension (dynamic, extensible)
    const firstDimGroups = data.reduce((acc, item) => {
      const firstDimKey = item.dimensions[0] || "Unknown";
      if (!acc[firstDimKey]) {
        acc[firstDimKey] = [];
      }
      acc[firstDimKey].push(item);
      return acc;
    }, {} as Record<string, DataPoint[]>);

    // Transform for Recharts grouped bar format
    return Object.entries(firstDimGroups).map(([firstDim, items]) => {
      const barData: any = { category: firstDim };
      items.forEach(item => {
        const subGroupKey = item.dimensions.slice(1).join("-") || 'default';
        barData[subGroupKey] = item.metric;
      });
      return barData;
    });
  };

  const renderChart = () => {
    if (dimensionCount > 1) {
      // Multi-dimension grouped bars
      const subGroupKeys = getSubGroupKeys(processedData);
      return (
        <BarChart data={processedData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" />
          <YAxis />
          <ChartTooltip />
          <Legend />
          {subGroupKeys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              fill={`hsl(var(--chart-${(index % 4) + 1}))`}
              name={key}
            />
          ))}
        </BarChart>
      );
    } else {
      // Single-dimension rendering: dimensions = ["environment"]
      return (
        <BarChart data={processedData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" /> {/* Same structure, simpler data */}
          <YAxis />
          <ChartTooltip />
          <Bar dataKey="value" fill="hsl(var(--chart-1))" />
        </BarChart>
      );
    }
  };

  return (
    <ChartContainer config={config}>
      {renderChart()}
    </ChartContainer>
  );
};
```

#### 3.3.2 Extended Pie Chart (In-Place Enhancement)

**User Story**: As a user, I want existing pie charts to automatically support multiple breakdown dimensions with nested donuts when I select multiple dimensions.

**Implementation** - Extend existing `PieChart.tsx`:

```typescript
export const PieChart: React.FC<ChartProps> = ({ data, config, accessibilityLayer = true }) => {
  // Detect if we have multi-dimensional data
  const dimensionCount = useMemo(() => {
    return getDimensionCount(data);
  }, [data]);

  // Calculate total metric value for center label
  const totalValue = useMemo(() => {
    return data.reduce((acc, curr) => acc + (curr.metric as number), 0);
  }, [data]);

  // Choose rendering approach based on dimension count
  const renderChart = () => {
    if (dimensionCount > 1) {
      return renderNestedDonut();
    } else {
      return renderSingleDimensionPie();
    }
  };

  // Existing single-dimension logic (unchanged)
  const renderSingleDimensionPie = () => {
    const chartData = data.map((item, index) => ({
      name: item.dimension || "Unknown",
      value: item.metric,
      fill: `hsl(var(--chart-${(index % 4) + 1}))`,
    }));

    return (
      <Pie
        data={chartData}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="50%"
        innerRadius={80}
        outerRadius={120}
        paddingAngle={2}
        strokeWidth={5}
      />
    );
  };

  // New multi-dimension nested donut logic
  const renderNestedDonut = () => {
    const multiDimData = enrichDataWithDimensions(data);
    const { innerRingData, outerRingData } = processNestedDonutData(multiDimData);

    return (
      <>
        {/* Inner ring - First dimension */}
        <Pie
          data={innerRingData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={80}
          paddingAngle={2}
        />
        {/* Outer ring - Multi-dimensional combinations */}
        <Pie
          data={outerRingData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={85}
          outerRadius={120}
          paddingAngle={1}
        />
      </>
    );
  };

  const processNestedDonutData = (data: DataPoint[]) => {
    // [Same logic as before, but as internal helper function]
    // ...
  };

  return (
    <ChartContainer config={config}>
      <PieChartComponent accessibilityLayer={accessibilityLayer}>
        <ChartTooltip />
        {renderChart()}
        {/* Center label (works for both single and multi-dimension) */}
        <Label content={/* existing center label logic */} />
      </PieChartComponent>
    </ChartContainer>
  );
};
```

#### 3.3.3 Integrated Legend Enhancement

**No separate legend component needed** - legends are enhanced within existing chart components using Recharts' built-in `<Legend />`:

```typescript
// Within each chart component (e.g., VerticalBarChart.tsx)
const renderChart = () => {
  if (dimensionCount > 1) {
    const subGroupKeys = getSubGroupKeys(processedData);
    return (
      <BarChart data={processedData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="category" />
        <YAxis />
        <ChartTooltip />

        {/* Enhanced legend automatically shows all dimension combinations */}
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="rect"
        />

        {subGroupKeys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            fill={`hsl(var(--chart-${(index % 4) + 1}))`}
            name={key} // This creates the legend label
          />
        ))}
      </BarChart>
    );
  }
  // ... single dimension logic
};

// Legend labels are automatically generated from dimension combinations:
// - Single dimension: "Production", "Staging"
// - Multi-dimension: "Production-GPT4", "Staging-Claude", etc.
// - Recharts handles overflow, scrolling, and responsive behavior
```

**Benefits of Integrated Approach**:

- ✅ **No separate component** - uses Recharts' built-in legend system
- ✅ **Automatic overflow handling** - Recharts handles >10 items gracefully
- ✅ **Consistent styling** - matches existing chart legends
- ✅ **Interactive features** - click to hide/show series (built-in)
- ✅ **Responsive behavior** - automatically adapts to container size

**Error Handling and Edge Cases**:

- Handle missing dimension values with "Unknown" labels
- Graceful degradation for single-dimension data
- Color palette cycling for many dimension combinations
- Legend collapse for >10 items to prevent UI overflow
- Responsive legend layout for different screen sizes

## 4. Database Schema

### 4.1 No Schema Changes Required

**Key Insight**: The existing database schema already supports multiple dimensions. The `QueryBuilder` class accepts `dimensions: Array<{ field: string }>` and generates appropriate GROUP BY clauses.

**Existing Schema Support**:

- Widget configurations already store `dimensions` as an array in the database
- All dimension fields exist in the current views (traces, observations, scores)
- No new tables or fields required

**Backward Compatibility**:

- Existing single-dimension widgets store dimension as `[{ field: "dimensionName" }]`
- Multi-dimension widgets will store as `[{ field: "primary" }, { field: "secondary" }]`
- Query system handles both formats identically

## 5. Server Actions

### 5.1 Database Actions

#### 5.1.1 Enhanced Widget Configuration Save

**Action**: `saveWidgetConfiguration`

**Input Parameters**:

```typescript
interface SaveWidgetRequest {
  name: string;
  description: string;
  view: string;
  dimensions: { field: string }[]; // Extended to support 2 items
  metrics: { measure: string; agg: string }[];
  filters: any[];
  chartType: DashboardWidgetChartType;
  chartConfig: ChartConfig;
}
```

**Implementation**:

```typescript
// No changes required - existing implementation already supports dimensions array
export const saveWidget = async (
  projectId: string,
  widgetData: SaveWidgetRequest,
) => {
  // Existing implementation handles dimensions array correctly
  return await prisma.dashboardWidget.create({
    data: {
      projectId,
      name: widgetData.name,
      description: widgetData.description,
      // ... existing fields
      dimensions: widgetData.dimensions, // Already supports array
      // ... rest of implementation
    },
  });
};
```

**Return Values**:

- Success: Widget configuration object with ID
- Error: Validation error details

#### 5.1.2 Enhanced Query Execution

**Action**: `executeWidgetQuery`

**Input Parameters**:

```typescript
interface QueryRequest {
  view: string;
  dimensions: { field: string }[]; // Now supports up to 2 items
  metrics: { measure: string; agg: string }[];
  filters: any[];
  timeDimension?: { granularity: string };
  fromTimestamp: string;
  toTimestamp: string;
}
```

**SQL Query Generation**:
The existing `QueryBuilder.build()` method already supports multiple dimensions:

```sql
-- Example generated query for 2 dimensions
SELECT
  environment as environment,
  provided_model_name as provided_model_name,
  sum(metric_value) as metric_value
FROM (
  SELECT
    observations.project_id,
    observations.id,
    any(observations.environment) as environment,
    any(observations.provided_model_name) as provided_model_name,
    count(*) as metric_value
  FROM observations FINAL
  WHERE observations.project_id = {projectId}
    AND observations.start_time >= {fromTimestamp}
    AND observations.start_time <= {toTimestamp}
  GROUP BY observations.project_id, observations.id
)
GROUP BY environment, provided_model_name
ORDER BY metric_value DESC;
```

**Return Values**:

```typescript
interface QueryResult {
  environment: string; // dimensions[0]
  provided_model_name: string; // dimensions[1]
  metric_value: number;
  // Easy to add dimensions[2], dimensions[3], etc.
}
[];
```

**Error Handling**:

- Validate dimension field names against view schema
- Handle query timeouts for large datasets
- Return appropriate error messages for invalid combinations

### 5.2 Data Processing Actions

#### 5.2.1 Multi-Dimension Data Transformation

**Action**: `transformQueryResultsToChartData`

**Input Parameters**:

```typescript
interface TransformRequest {
  queryResults: Record<string, any>[];
  dimensions: string[];
  hasTimeDimension: boolean;
  chartType: DashboardWidgetChartType;
}
```

**Implementation**:

```typescript
export const transformQueryResultsToChartData = (
  request: TransformRequest,
): DataPoint[] => {
  const { queryResults, dimensions, hasTimeDimension, chartType } = request;

  return queryResults.map((row) => {
    // Handle single dimension (backward compatibility)
    if (dimensions.length === 1) {
      return {
        time_dimension: hasTimeDimension ? row.time_dimension : undefined,
        dimension: row[dimensions[0]],
        metric: row.metric_value || 0,
      };
    }

    // Handle multiple dimensions
    const dimensionValues = dimensions.map((dim) => row[dim]);
    const combinedDimension = dimensionValues.join("|");

    return {
      time_dimension: hasTimeDimension ? row.time_dimension : undefined,
      dimension: combinedDimension, // For backward compatibility
      dimensions: dimensionValues,
      combinedDimension,
      metric: row.metric_value || 0,
    };
  });
};
```

**Return Values**:

- Array of `DataPoint` objects ready for chart consumption
- Includes both single and multi-dimension support

## 6. Design System

### 6.1 Visual Style

**Color Palette Extensions**:

```css
:root {
  /* Existing chart colors */
  --chart-1: 12 76% 61%;
  --chart-2: 173 58% 39%;
  --chart-3: 197 37% 24%;
  --chart-4: 43 74% 66%;

  /* Extended colors for multi-breakdown */
  --chart-1-light: 12 76% 61% / 0.7;
  --chart-2-light: 173 58% 39% / 0.7;
  --chart-3-light: 197 37% 24% / 0.7;
  --chart-4-light: 43 74% 66% / 0.7;

  /* Pattern support for accessibility */
  --pattern-primary: solid;
  --pattern-secondary: dashed;
}
```

**Typography**:

- **Form Labels**: `text-sm font-medium` (existing pattern)
- **Dimension Labels**: `text-xs text-muted-foreground` for secondary info
- **Legend Items**: `text-sm` with `truncate` for long dimension names
- **Chart Tooltips**: Use existing chart tooltip styling

**Component Styling Patterns**:

```css
/* Multi-dimension dropdown styling */
.dimension-dropdown {
  @apply space-y-2;
}

.dimension-dropdown.secondary:disabled {
  @apply opacity-50 cursor-not-allowed;
}

/* Legend styling */
.multi-dimension-legend {
  @apply mt-4 space-y-2;
}

.legend-item {
  @apply flex items-center space-x-2 text-sm;
}

.legend-color-indicator {
  @apply h-3 w-3 rounded-sm flex-shrink-0;
}
```

**Spacing and Layout**:

- **Form spacing**: 16px (`space-y-4`) between dimension dropdowns
- **Legend spacing**: 8px (`space-y-2`) between legend items
- **Chart margins**: Use existing chart margin patterns
- **Responsive breakpoints**: Follow existing widget responsive design

### 6.2 Core Components

#### 6.2.2 Transparent Chart Enhancement

**No separate "Enhanced" components needed** - existing charts automatically detect and handle multi-dimensional data:

```typescript
// Chart.tsx - No changes needed to routing logic
export const Chart = ({ chartType, data, rowLimit, chartConfig, ...props }) => {
  // Existing chart routing works transparently
  const renderChart = () => {
    switch (chartType) {
      case "LINE_TIME_SERIES":
        return <LineChartTimeSeries data={data} {...props} />; // Auto-detects multi-dim
      case "BAR_TIME_SERIES":
        return <VerticalBarChartTimeSeries data={data} {...props} />; // Auto-detects multi-dim
      case "HORIZONTAL_BAR":
        return <HorizontalBarChart data={data.slice(0, rowLimit)} {...props} />; // Extended
      case "VERTICAL_BAR":
        return <VerticalBarChart data={data.slice(0, rowLimit)} {...props} />; // Extended
      case "PIE":
        return <PieChart data={data.slice(0, rowLimit)} {...props} />; // Extended
      case "HISTOGRAM":
        return <HistogramChart data={data} {...props} />; // No change needed
      case "NUMBER":
        return <BigNumber data={data} {...props} />; // No change needed
      case "PIVOT_TABLE":
        return <PivotTable data={data} config={pivotConfig} {...props} />; // Already multi-dim
      default:
        return <HorizontalBarChart data={data.slice(0, rowLimit)} {...props} />;
    }
  };

  return (
    <CardContent className="h-full p-0">
      {renderChart()}
    </CardContent>
  );
};

// Individual chart components detect dimension count internally:
// - Single dimension: Use existing rendering logic
// - Multiple dimensions: Use enhanced rendering logic
// - Consumer code unchanged
```

**Interactive States**:

- **Hover**: Chart elements highlight with increased opacity
- **Active**: Selected legend items highlight corresponding chart elements
- **Disabled**: Subsequent dimension dropdowns show disabled styling when previous dimension not selected
- **Loading**: Show skeleton loaders during data processing

## 7. Component Architecture

### 7.1 Server Components

**Data Fetching Strategy**:

- Use existing tRPC data fetching patterns
- No changes required to server components
- Multi-dimension queries handled by existing query router

**Suspense Boundaries**:

- Use existing widget loading boundaries
- No additional suspense needed for multi-dimension features

**Error Handling**:

- Use existing error boundary patterns
- Add specific error messages for dimension validation failures

### 7.2 Client Components

#### 7.2.1 Enhanced WidgetForm State Management

```typescript
interface WidgetFormState {
  // Existing state...
  dimensions: string[]; // Unified approach - no more primary/secondary
}

const MAX_DIMENSIONS = 2; // Easy to change to 3+ in future

const useWidgetFormState = (initialValues: InitialValues) => {
  // Extract dimensions from initialValues - unified approach
  const [dimensions, setDimensions] = useState<string[]>(() => {
    const dims = initialValues.dimensions || [];
    return dims.map((d) => d.field);
  });

  // Single helper to update any dimension index
  const updateDimension = useCallback(
    (index: number, value: string) => {
      const newDimensions = [...dimensions];
      if (value && value !== "none") {
        newDimensions[index] = value;
      } else {
        // Clear this dimension and all subsequent ones
        newDimensions.splice(index);
      }
      setDimensions(newDimensions);
    },
    [dimensions],
  );

  // Chart type compatibility - simplified
  useEffect(() => {
    const chartType = chartTypes.find((c) => c.value === selectedChartType);
    if (!chartType?.supportsBreakdown) {
      setDimensions([]); // Clear all dimensions
    }
  }, [selectedChartType]);

  // No complex logic needed - dimensions are already in the right format!
  const getDimensionsArray = useCallback((): { field: string }[] => {
    return dimensions.map((field) => ({ field }));
  }, [dimensions]);

  return {
    dimensions,
    updateDimension,
    getDimensionsArray,
  };
};
```

#### 7.2.2 Chart Data Processing Hook

```typescript
const useMultiDimensionChartData = (
  data: DataPoint[],
  chartType: DashboardWidgetChartType,
) => {
  const dimensionCount = useMemo(() => {
    if (!data.length) return 0;
    const firstItem = data[0];
    return firstItem.dimensions?.length || (firstItem.dimension ? 1 : 0);
  }, [data]);

  const processedData = useMemo(() => {
    return enrichDataWithDimensions(data, dimensionCount);
  }, [data, dimensionCount]);

  const chartData = useMemo(() => {
    switch (chartType) {
      case "HORIZONTAL_BAR":
      case "VERTICAL_BAR":
        return groupDataForGroupedBars(processedData);
      case "PIE":
        return processNestedDonutData(processedData);
      case "BAR_TIME_SERIES":
      case "LINE_TIME_SERIES":
        return groupTimeSeriesDataByMultiDimension(processedData);
      default:
        return processedData;
    }
  }, [processedData, chartType]);

  return {
    dimensionCount,
    processedData,
    chartData,
  };
};
```

**Event Handlers**:

- `updateDimension(index, value)`: Updates dimension at any index, clears subsequent dimensions if needed
- `onChartTypeChange`: Validates dimension compatibility and resets if needed
- **Much simpler**: Single handler works for any number of dimensions!

**UI Interactions**:

- Dropdown interactions follow existing patterns
- Legend item clicks highlight corresponding chart elements
- Tooltip interactions show multi-dimensional breakdown

## 8. Authentication & Authorization

**No Changes Required**: Multi-breakdown charts use existing authentication and authorization patterns. All data access goes through existing tRPC routes with proper project-level authorization.

## 9. Data Flow

### 9.1 Enhanced Data Flow Diagram

```
User Interaction
    ↓
WidgetForm (Multi-Dimension Selection)
    ↓
dimensions: [{ field: "primary" }, { field: "secondary" }]
    ↓
tRPC Query Router (existing)
    ↓
QueryBuilder.build() (existing - already supports multiple dimensions)
    ↓
ClickHouse Query Execution
    ↓
Multi-Dimensional Results: [{ primary: "A", secondary: "X", metric: 100 }, ...]
    ↓
transformQueryResultsToChartData()
    ↓
DataPoint[] with combinedDimension keys
    ↓
Chart Component (Enhanced)
    ↓
Multi-Dimension Rendering (Grouped Bars, Nested Donut, etc.)
```

### 9.2 State Management Architecture

**Client State**:

```typescript
interface WidgetState {
  dimensions: string[]; // Unified approach - any number of dimensions
  chartType: DashboardWidgetChartType;
  // ... existing state
}
```

**Server State** (via tRPC):

```typescript
interface QueryState {
  data: DataPoint[];
  isLoading: boolean;
  error: Error | null;
  dimensionCount: number;
}
```

**Data Transformation Pipeline**:

1. Raw query results from database
2. Transform to DataPoint[] with dimension arrays
3. Create combined dimension keys
4. Process for chart-specific rendering
5. Apply chart-specific grouping/nesting

## 10. Testing

### 10.1 Server-Side Tests (Jest)

#### 10.1.1 Query Builder Tests

```typescript
// tests/queryBuilder.test.ts
describe("QueryBuilder Multi-Dimension Support", () => {
  test("should generate correct SQL for two dimensions", () => {
    const query = {
      view: "observations",
      dimensions: [{ field: "environment" }, { field: "provided_model_name" }],
      metrics: [{ measure: "count", agg: "count" }],
      filters: [],
      fromTimestamp: "2024-01-01T00:00:00Z",
      toTimestamp: "2024-01-02T00:00:00Z",
    };

    const result = queryBuilder.build(query, "project-id");

    expect(result.query).toContain("GROUP BY environment, provided_model_name");
    expect(result.query).toContain(
      "any(observations.environment) as environment",
    );
    expect(result.query).toContain(
      "any(observations.provided_model_name) as provided_model_name",
    );
  });

  test("should handle backward compatibility with single dimension", () => {
    const query = {
      view: "traces",
      dimensions: [{ field: "name" }],
      metrics: [{ measure: "count", agg: "count" }],
      filters: [],
      fromTimestamp: "2024-01-01T00:00:00Z",
      toTimestamp: "2024-01-02T00:00:00Z",
    };

    const result = queryBuilder.build(query, "project-id");

    expect(result.query).toContain("GROUP BY name");
    expect(result.query).toContain("any(traces.name) as name");
  });

  test("should validate dimension field names", () => {
    const query = {
      view: "traces",
      dimensions: [{ field: "invalid_dimension" }, { field: "name" }],
      metrics: [{ measure: "count", agg: "count" }],
      filters: [],
      fromTimestamp: "2024-01-01T00:00:00Z",
      toTimestamp: "2024-01-02T00:00:00Z",
    };

    expect(() => queryBuilder.build(query, "project-id")).toThrow(
      "Invalid dimension invalid_dimension",
    );
  });
});
```

#### 10.1.2 Data Transformation Tests

```typescript
// tests/dataTransformation.test.ts
describe("Multi-Dimension Data Transformation", () => {
  test("should create combined dimension keys", () => {
    const rawData = [
      {
        environment: "production",
        provided_model_name: "gpt-4",
        metric_value: 100,
      },
      {
        environment: "staging",
        provided_model_name: "gpt-3.5",
        metric_value: 50,
      },
    ];

    const result = transformQueryResultsToChartData({
      queryResults: rawData,
      dimensions: ["environment", "provided_model_name"],
      hasTimeDimension: false,
      chartType: "VERTICAL_BAR",
    });

    expect(result).toEqual([
      {
        time_dimension: undefined,
        dimension: "production|gpt-4",
        dimensions: ["production", "gpt-4"],
        combinedDimension: "production|gpt-4",
        metric: 100,
      },
      {
        time_dimension: undefined,
        dimension: "staging|gpt-3.5",
        dimensions: ["staging", "gpt-3.5"],
        combinedDimension: "staging|gpt-3.5",
        metric: 50,
      },
    ]);
  });

  test("should handle single dimension backward compatibility", () => {
    const rawData = [
      { name: "trace-1", metric_value: 100 },
      { name: "trace-2", metric_value: 200 },
    ];

    const result = transformQueryResultsToChartData({
      queryResults: rawData,
      dimensions: ["name"],
      hasTimeDimension: false,
      chartType: "HORIZONTAL_BAR",
    });

    expect(result).toEqual([
      {
        time_dimension: undefined,
        dimension: "trace-1",
        metric: 100,
      },
      {
        time_dimension: undefined,
        dimension: "trace-2",
        metric: 200,
      },
    ]);
  });

  test("should handle missing dimension values", () => {
    const rawData = [
      {
        environment: "production",
        provided_model_name: null,
        metric_value: 100,
      },
      { environment: null, provided_model_name: "gpt-4", metric_value: 50 },
    ];

    const result = transformQueryResultsToChartData({
      queryResults: rawData,
      dimensions: ["environment", "provided_model_name"],
      hasTimeDimension: false,
      chartType: "PIE",
    });

    expect(result[0].dimensions).toEqual(["production", null]);
    expect(result[1].dimensions).toEqual([null, "gpt-4"]);
  });
});
```

#### 10.1.3 Chart Data Processing Tests

```typescript
// tests/chartDataProcessing.test.ts
describe("Chart-Specific Data Processing", () => {
  test("should group data for grouped bar charts", () => {
    const multiDimData: DataPoint[] = [
      {
        dimensions: ["production", "gpt-4"],
        combinedDimension: "production|gpt-4",
        metric: 100,
      },
      {
        dimensions: ["production", "gpt-3.5"],
        combinedDimension: "production|gpt-3.5",
        metric: 50,
      },
      {
        dimensions: ["staging", "gpt-4"],
        combinedDimension: "staging|gpt-4",
        metric: 25,
      },
    ];

    const result = groupDataForGroupedBars(multiDimData);

    expect(result).toEqual([
      {
        [multiDimData[0].dimensions[0]]: "production", // Dynamic first dimension
        "gpt-4": 100,
        "gpt-3.5": 50,
      },
      {
        [multiDimData[0].dimensions[0]]: "staging",
        "gpt-4": 25,
      },
    ]);
  });

  test("should process nested donut data", () => {
    const multiDimData: DataPoint[] = [
      {
        dimensions: ["production", "gpt-4"],
        combinedDimension: "production|gpt-4",
        metric: 100,
      },
      {
        dimensions: ["production", "gpt-3.5"],
        combinedDimension: "production|gpt-3.5",
        metric: 50,
      },
    ];

    const result = processNestedDonutData(multiDimData);

    expect(result.innerRingData).toEqual([
      { name: "production", value: 150, fill: expect.stringContaining("hsl") },
    ]);

    expect(result.outerRingData).toHaveLength(2);
    expect(result.outerRingData[0].name).toBe("production - gpt-4");
    expect(result.outerRingData[0].value).toBe(100);
  });
});
```

#### 10.1.4 Integration Tests

```typescript
// tests/integration/multiBreakdownCharts.test.ts
describe("Multi-Breakdown Charts Integration", () => {
  test("should handle complete flow from widget save to chart rendering", async () => {
    // Test widget save with multiple dimensions
    const widgetData = {
      name: "Test Multi-Breakdown Chart",
      description: "Testing multi-dimension functionality",
      view: "observations",
      dimensions: [{ field: "environment" }, { field: "provided_model_name" }],
      metrics: [{ measure: "count", agg: "count" }],
      filters: [],
      chartType: "VERTICAL_BAR" as const,
      chartConfig: {},
    };

    const widget = await saveWidget("project-id", widgetData);
    expect(widget.dimensions).toHaveLength(2);

    // Test query execution
    const queryResults = await executeWidgetQuery({
      view: "observations",
      dimensions: widget.dimensions,
      metrics: widget.metrics,
      filters: [],
      fromTimestamp: "2024-01-01T00:00:00Z",
      toTimestamp: "2024-01-02T00:00:00Z",
    });

    expect(queryResults).toBeDefined();
    expect(queryResults.length).toBeGreaterThan(0);

    // Test data transformation
    const chartData = transformQueryResultsToChartData({
      queryResults,
      dimensions: ["environment", "provided_model_name"],
      hasTimeDimension: false,
      chartType: "VERTICAL_BAR",
    });

    expect(chartData[0]).toHaveProperty("combinedDimension");
    expect(chartData[0]).toHaveProperty("dimensions");
    expect(chartData[0].dimensions).toHaveLength(2);
  });
});
```

### 10.2 No UI Tests Required

As specified in the requirements, no UI tests are needed. The focus is on server-side logic testing to ensure proper query generation, data transformation, and chart data processing.

### 10.3 Test Coverage Goals

- **Query Builder**: 100% coverage for multi-dimension query generation
- **Data Transformation**: 100% coverage for dimension key creation and processing
- **Chart Data Processing**: 100% coverage for chart-specific data grouping
- **Integration**: End-to-end flow testing from widget configuration to data rendering
- **Error Handling**: Test all validation and error scenarios
- **Backward Compatibility**: Ensure existing single-dimension functionality unchanged
