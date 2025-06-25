# Pivot Table Widget Implementation Plan

## Phase 1: Core Infrastructure Setup

- [x] Step 1: Database Schema Migration

  - **Task**: Add PIVOT_TABLE enum value to DashboardWidgetChartType in PostgreSQL database and update generated types
  - **Files**:
    - `packages/shared/prisma/migrations/add_pivot_table_type.sql`: Create migration file to add PIVOT_TABLE enum value
    - `packages/shared/prisma/schema.prisma`: Verify enum includes PIVOT_TABLE (should auto-update after migration)
  - **Step Dependencies**: None
  - **User Instructions**: Run `pnpm db:migrate` to apply the database migration

- [x] Step 2: Type Definitions and Constants

  - **Task**: Create core type definitions, interfaces, and configuration constants for pivot table functionality
  - **Files**:
    - `web/src/features/widgets/utils/pivot-table-utils.ts`: Create utility file with MAX_DIMENSIONS constant, PivotTableRow interface, and core transformation functions
    - `packages/shared/src/server/services/DashboardService/types.ts`: Add PivotTableChartConfig to ChartConfigSchema discriminated union
  - **Step Dependencies**: Step 1
  - **User Instructions**: None

- [x] Step 3: Query Builder Enhancement
  - **Task**: Enhance QueryBuilder to handle multiple dimensions for pivot table queries with proper GROUP BY clauses
  - **Files**:
    - `web/src/features/query/server/queryBuilder.ts`: Update build method to handle multiple dimensions in GROUP BY clauses for pivot table queries
    - `web/src/features/query/types.ts`: Update QueryType interface to support pivot table dimensions configuration
  - **Step Dependencies**: Step 2
  - **User Instructions**: None

## Phase 2: Data Processing Pipeline

- [ ] Step 4: Data Transformation Engine

  - **Task**: Implement core data transformation logic to convert flat query results into nested pivot table structure with totals and subtotals
  - **Files**:
    - `web/src/features/widgets/utils/pivot-table-utils.ts`: Implement transformToPivotTable function with support for 0-N dimensions, subtotals, and grand totals
  - **Step Dependencies**: Step 3
  - **User Instructions**: None

- [ ] Step 5: Chart Type Registration
  - **Task**: Register PIVOT_TABLE as a new chart type in the widget system with proper routing and utilities
  - **Files**:
    - `web/src/features/widgets/chart-library/utils.ts`: Add PIVOT_TABLE to isTimeSeriesChart function and getChartTypeDisplayName function
    - `web/src/features/widgets/components/WidgetForm.tsx`: Add PIVOT_TABLE to chartTypes array with appropriate icon and configuration
  - **Step Dependencies**: Step 4
  - **User Instructions**: None

## Phase 3: UI Components

- [ ] Step 6: Basic Pivot Table Component

  - **Task**: Create the core PivotTable React component with table structure, indentation, and styling
  - **Files**:
    - `web/src/features/widgets/chart-library/PivotTable.tsx`: Create new component with table rendering, row indentation, and responsive design
    - `web/src/features/widgets/chart-library/chart-props.ts`: Add PivotTableProps interface if needed
  - **Step Dependencies**: Step 5
  - **User Instructions**: None

- [ ] Step 7: Chart Router Integration

  - **Task**: Integrate PivotTable component into the Chart router to handle PIVOT_TABLE chart type
  - **Files**:
    - `web/src/features/widgets/chart-library/Chart.tsx`: Add PIVOT_TABLE case to renderChart switch statement
  - **Step Dependencies**: Step 6
  - **User Instructions**: None

- [ ] Step 8: Widget Configuration Form
  - **Task**: Enhance WidgetForm to support configurable dimensions with dynamic selectors based on MAX_DIMENSIONS
  - **Files**:
    - `web/src/features/widgets/components/WidgetForm.tsx`: Add dynamic dimension selector logic with proper state management and validation
  - **Step Dependencies**: Step 7
  - **User Instructions**: None

## Phase 4: Styling and UX Polish

- [ ] Step 9: Table Styling and Responsive Design

  - **Task**: Implement proper styling for pivot table with indentation, bold totals, and responsive layout within dashboard grid
  - **Files**:
    - `web/src/features/widgets/chart-library/PivotTable.tsx`: Add comprehensive CSS classes, indentation logic, and responsive behavior
  - **Step Dependencies**: Step 8
  - **User Instructions**: None

- [ ] Step 10: Error Handling and Edge Cases

  - **Task**: Implement comprehensive error handling for empty data, missing dimensions, and malformed queries
  - **Files**:
    - `web/src/features/widgets/chart-library/PivotTable.tsx`: Add error boundaries, loading states, and empty data handling
    - `web/src/features/widgets/utils/pivot-table-utils.ts`: Add error handling for edge cases in data transformation
  - **Step Dependencies**: Step 9
  - **User Instructions**: None

- [ ] Step 11: Form Validation and User Experience
  - **Task**: Implement proper form validation for dimension selection and enhance user experience with conditional selectors
  - **Files**:
    - `web/src/features/widgets/components/WidgetForm.tsx`: Add validation logic for dimension dependencies and improve UX with proper enabling/disabling of selectors
  - **Step Dependencies**: Step 10
  - **User Instructions**: None

## Phase 5: Testing Implementation

- [ ] Step 12: Unit Tests for Data Transformation

  - **Task**: Create comprehensive unit tests for pivot table data transformation utilities
  - **Files**:
    - `web/src/__tests__/pivot-table-utils.clienttest.ts`: Test transformToPivotTable function with various dimension scenarios, edge cases, and MAX_DIMENSIONS configuration
  - **Step Dependencies**: Step 11
  - **User Instructions**: Run `pnpm test-sync --testPathPattern="pivot-table"` to verify tests pass

- [ ] Step 13: Component Tests

  - **Task**: Create unit tests for PivotTable React component functionality
  - **Files**:
    - `web/src/__tests__/pivot-table.clienttest.ts`: Test component rendering, styling, and interaction handling
  - **Step Dependencies**: Step 12
  - **User Instructions**: Run `pnpm test-sync --testPathPattern="pivot-table"` to verify tests pass

- [ ] Step 14: Integration Tests
  - **Task**: Create integration tests for dashboard query execution and data pipeline
  - **Files**:
    - `web/src/__tests__/dashboard-router-pivot-table.servertest.ts`: Test executeQuery function with pivot table queries, SQL generation, and data processing pipeline
  - **Step Dependencies**: Step 13
  - **User Instructions**: Run `pnpm test-async --testPathPattern="dashboard-router"` to verify tests pass

## Phase 6: Final Integration and Documentation

- [ ] Step 15: Widget Form Integration Testing

  - **Task**: Test complete widget creation flow with pivot table configuration and ensure proper data flow
  - **Files**:
    - `web/src/features/widgets/components/WidgetForm.tsx`: Final integration testing and bug fixes for form submission and data handling
  - **Step Dependencies**: Step 14
  - **User Instructions**: Test widget creation manually in the dashboard interface

- [ ] Step 16: Performance Optimization and Row Limiting

  - **Task**: Implement and test the 20-row limit functionality and ensure performance with large datasets
  - **Files**:
    - `web/src/features/widgets/utils/pivot-table-utils.ts`: Implement proper row limiting before adding totals
    - `web/src/features/widgets/chart-library/PivotTable.tsx`: Add performance optimizations for large datasets
  - **Step Dependencies**: Step 15
  - **User Instructions**: Test with large datasets to verify performance and row limiting

- [ ] Step 17: Final Code Review and Cleanup
  - **Task**: Final code review, cleanup, and documentation of the pivot table widget implementation
  - **Files**:
    - All modified files: Code cleanup, comment addition, and final review
  - **Step Dependencies**: Step 16
  - **User Instructions**: Conduct thorough testing of all pivot table functionality across different scenarios

## Summary

This implementation plan breaks down the pivot table widget feature into 17 manageable steps across 6 phases:

1. **Core Infrastructure Setup** (Steps 1-3): Database migration, type definitions, and query builder enhancements
2. **Data Processing Pipeline** (Steps 4-5): Data transformation engine and chart type registration
3. **UI Components** (Steps 6-8): React component creation and form integration
4. **Styling and UX Polish** (Steps 9-11): Visual design, error handling, and user experience improvements
5. **Testing Implementation** (Steps 12-14): Comprehensive test coverage for utilities, components, and integration
6. **Final Integration and Documentation** (Steps 15-17): End-to-end testing, performance optimization, and cleanup

Each step is designed to be atomic and builds upon previous steps, ensuring a logical implementation flow. The plan follows the existing Langfuse codebase patterns and integrates seamlessly with the current dashboard widget system while maintaining the configurable architecture for future expansion beyond 2 dimensions.

Key considerations:

- Maintains backward compatibility with existing widget system
- Follows established patterns for chart types and data transformation
- Implements comprehensive error handling and edge case management
- Includes thorough testing strategy covering unit, component, and integration tests
- Supports future expansion through configurable MAX_DIMENSIONS constant
