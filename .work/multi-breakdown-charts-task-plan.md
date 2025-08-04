# Implementation Plan: Multi-Breakdown Charts

## Phase 1: Foundation and Data Interfaces

- [x] Step 1: Create Multi-Dimension Utility Functions
  - **Task**: Create reusable utility functions for multi-dimensional data processing that will be shared across all chart types
  - **Files**: (2 files)
    - `web/src/features/widgets/utils/dimension-utils.ts`: Create new utility functions for dimension key creation, data enrichment, and dimension counting
    - `web/src/features/widgets/chart-library/chart-props.ts`: Extend DataPoint interface to support dimensions array while maintaining backward compatibility
  - **Step Dependencies**: None
  - **User Instructions**: None

- [x] Step 2: Update Constants and Configuration
  - **Task**: Rename and generalize pivot table constants to work for all chart types, establishing the foundation for unified dimension limits
  - **Files**: (3 files)
    - `web/src/features/widgets/utils/pivot-table-utils.ts`: Rename MAX_PIVOT_TABLE_DIMENSIONS to MAX_DIMENSIONS and update exports
    - `web/src/features/widgets/components/WidgetForm.tsx`: Update imports to use the new MAX_DIMENSIONS constant
    - `web/src/__tests__/pivot-table-utils.servertest.ts`: Update constant reference in tests
  - **Step Dependencies**: Step 1
  - **User Instructions**: None

- [x] Step 3: Enhance Data Processing Utilities
  - **Task**: Create enhanced data processing functions that can handle both single and multi-dimensional data for all chart types
  - **Files**: (2 files)
    - `web/src/features/widgets/chart-library/utils.ts`: Create new data processing functions for multi-dimensional grouping, time series processing, and chart-specific data transformation
    - `web/src/features/widgets/utils.ts`: Update buildWidgetName and buildWidgetDescription functions to handle multiple dimensions
  - **Step Dependencies**: Step 1, Step 2
  - **User Instructions**: None

## Phase 2: UI Unification

- [x] Step 4: Unify WidgetForm Dimension Selection
  - **Task**: Remove the artificial distinction between regular chart dimensions and pivot table dimensions by implementing a single unified dimension selection UI for all chart types
  - **Files**: (1 file)
    - `web/src/features/widgets/components/WidgetForm.tsx`: Replace separate `selectedDimension` and `pivotDimensions` state with unified `dimensions` array, update UI to use single multi-select pattern for all chart types, update query building logic to be chart-agnostic, simplify save logic to use single dimensions array
  - **Step Dependencies**: Step 1, Step 2, Step 3
  - **User Instructions**: None

## Phase 3: Chart Enhancement - Bar Charts

- [x] Step 5: Enhance Vertical Bar Chart for Multi-Dimensions
  - **Task**: Extend the existing VerticalBarChart component to auto-detect dimension count and render grouped bars when multiple dimensions are present
  - **Files**: (1 file)
    - `web/src/features/widgets/chart-library/VerticalBarChart.tsx`: Add dimension count detection, implement grouped bar data processing, add multi-dimensional rendering logic while maintaining backward compatibility for single dimensions
  - **Step Dependencies**: Step 1, Step 3
  - **User Instructions**: None

- [x] Step 6: Enhance Horizontal Bar Chart for Multi-Dimensions
  - **Task**: Extend the existing HorizontalBarChart component to auto-detect dimension count and render grouped bars when multiple dimensions are present
  - **Files**: (1 file)
    - `web/src/features/widgets/chart-library/HorizontalBarChart.tsx`: Add dimension count detection, implement grouped bar data processing, add multi-dimensional rendering logic while maintaining backward compatibility for single dimensions
  - **Step Dependencies**: Step 5 (for consistency)
  - **User Instructions**: None

## Phase 4: Chart Enhancement - Pie Charts

- [x] Step 7: Enhance Pie Chart for Multi-Dimensions
  - **Task**: Extend the existing PieChart component to auto-detect dimension count and render nested donuts when multiple dimensions are present
  - **Files**: (1 file)
    - `web/src/features/widgets/chart-library/PieChart.tsx`: Add dimension count detection, implement nested donut data processing (inner ring for first dimension, outer ring for combinations), add multi-dimensional rendering logic while maintaining backward compatibility
  - **Step Dependencies**: Step 1, Step 3
  - **User Instructions**: None

## Phase 5: Chart Enhancement - Time Series

- [x] Step 8: Enhance Time Series Bar Chart for Multi-Dimensions
  - **Task**: Extend the existing VerticalBarChartTimeSeries component to support multiple dimension breakdowns over time
  - **Files**: (1 file)
    - `web/src/features/widgets/chart-library/VerticalBarChartTimeSeries.tsx`: Add multi-dimensional time series data processing, implement grouped time series rendering, ensure backward compatibility with single dimension time series
  - **Step Dependencies**: Step 1, Step 3, Step 5 (for grouped bar patterns)
  - **User Instructions**: None

## Phase 6: Testing and Validation

- [ ] Step 9: Add Server-Side Tests for Multi-Dimension Processing
  - **Task**: Create comprehensive server-side tests to ensure multi-dimensional query generation, data transformation, and chart data processing work correctly
  - **Files**: (3 files)
    - `web/src/__tests__/multi-dimension-data-processing.servertest.ts`: Test dimension utility functions, data transformation, and combined dimension key creation
    - `web/src/__tests__/multi-dimension-query-building.servertest.ts`: Test unified query building logic works for all chart types with multiple dimensions
    - `web/src/__tests__/multi-dimension-chart-data.servertest.ts`: Test chart-specific data processing for grouped bars, nested donuts, and time series
  - **Step Dependencies**: Step 1, Step 3, Step 4
  - **User Instructions**: None

- [ ] Step 10: Integration Testing and Backward Compatibility Verification
  - **Task**: Create integration tests to ensure the complete flow from widget configuration to chart rendering works properly and all existing single-dimension functionality remains unchanged
  - **Files**: (2 files)
    - `web/src/__tests__/integration/multi-breakdown-widgets.servertest.ts`: Test complete widget save/load/render flow with multiple dimensions, test backward compatibility with existing single-dimension widgets
    - `web/src/__tests__/backward-compatibility-widgets.servertest.ts`: Verify all existing widget configurations continue to work unchanged, test data migration scenarios
  - **Step Dependencies**: Step 4, Step 5, Step 6, Step 7, Step 8
  - **User Instructions**: Run the test suite to ensure no regressions: `pnpm test-sync --testPathPattern="multi-breakdown"` and `pnpm test-sync --testPathPattern="backward-compatibility"`

## Phase 7: Future Extension (Line Charts - Phase 2)

- [ ] Step 11: Enhance Line Chart for Multi-Dimensions (Optional/Future)
  - **Task**: Extend the existing LineChartTimeSeries component to support multi-dimensional breakdowns with different line styles and colors for dimension combinations
  - **Files**: (1 file)
    - `web/src/features/widgets/chart-library/LineChartTimeSeries.tsx`: Add multi-dimensional line series processing, implement different line styles (solid/dashed) and colors for dimension combinations, handle legend complexity for multiple series
  - **Step Dependencies**: Step 8 (for time series patterns)
  - **User Instructions**: This step implements Phase 2 requirements and can be done in a future iteration if needed
