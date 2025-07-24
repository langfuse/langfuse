# Implementation Plan

## Phase 1: Foundation and Core Implementation

- [x] Step 1: Set up core types and sorting hook
  - **Task**: Import OrderByState type and implement usePivotTableSort hook with session storage
  - **Files**:
    - `web/src/features/widgets/hooks/usePivotTableSort.ts`: Create new hook with OrderByState
  - **Step Dependencies**: None
  - **User Instructions**: None

- [x] Step 2: Implement sorting algorithms and basic tests
  - **Task**: Add hierarchical sorting functions to pivot table utils and create unit tests
  - **Files**:
    - `web/src/features/widgets/utils/pivot-table-utils.ts`: Add sorting functions
    - `web/src/__tests__/pivot-table-sorting.clienttest.ts`: Create comprehensive tests
  - **Step Dependencies**: Step 1
  - **User Instructions**: None

## Phase 2: UI Components and Visual Integration

- [x] Step 3: Extend PivotTable with sorting UI and functionality
  - **Task**: Add SortableHeader component, sorting props, click handlers, and visual styling
  - **Files**:
    - `web/src/features/widgets/chart-library/PivotTable.tsx`: Add sorting UI, props, and styling
  - **Step Dependencies**: Steps 1-2
  - **User Instructions**: None

## Phase 3: Widget Configuration and Schema

- [x] Step 4: Extend widget schema and form configuration
  - **Task**: Add defaultSort to PivotTableChartConfig schema and implement form UI with validation
  - **Files**:
    - `packages/shared/src/server/services/DashboardService/types.ts`: Extend schema
    - `web/src/features/widgets/components/WidgetForm.tsx`: Add sort configuration UI and form handling
  - **Step Dependencies**: Step 1
  - **User Instructions**: None

## Phase 4: Server-Side Integration

- [x] Step 5: Implement server-side sorting and query integration
  - **Task**: Extend query builders for ORDER BY support, update dashboard services, and ensure sorting before row limiting
  - **Files**:
    - `web/src/features/widgets/utils/query-builder.ts`: Add sort parameter support and query generation order
    - `web/src/features/widgets/components/DashboardWidget.tsx`: Update service integration
  - **Step Dependencies**: Steps 1, 4
  - **User Instructions**: None

## Phase 5: Integration and State Management

- [x] Step 6: Integrate sort state with DashboardWidget and apply default sort
  - **Task**: Connect PivotTable sorting with widget-level state, apply default sort on initialization, and implement session storage persistence
  - **Files**:
    - `web/src/features/widgets/components/DashboardWidget.tsx`: Add sort state integration, default sort handling, and persistence
    - `web/src/features/widgets/hooks/usePivotTableSort.ts`: Ensure persistence is working
  - **Step Dependencies**: Steps 1-5
  - **User Instructions**: None

## Phase 6: Error Handling and Edge Cases

- [ ] Step 7: Add comprehensive error handling and edge case management
  - **Task**: Implement graceful error handling, edge cases for empty groups/equal values, and backward compatibility
  - **Files**:
    - `web/src/features/widgets/chart-library/PivotTable.tsx`: Add error handling and compatibility checks
    - `web/src/features/widgets/hooks/usePivotTableSort.ts`: Add error handling
    - `web/src/features/widgets/utils/pivot-table-utils.ts`: Add edge case handling
    - `web/src/features/widgets/components/WidgetForm.tsx`: Add compatibility handling
  - **Step Dependencies**: Steps 3, 6
  - **User Instructions**: None

## Phase 7: Testing and Validation

- [ ] Step 8: Create comprehensive test suite
  - **Task**: Add integration tests for widget configuration, visual regression tests for sort UI, and server-side sorting tests
  - **Files**:
    - `web/src/__tests__/widget-form-sorting.test.ts`: Create integration tests
    - `web/src/__tests__/pivot-table-sorting-ui.test.ts`: Create UI tests
    - `web/src/__tests__/pivot-table-server-sorting.test.ts`: Create server tests
  - **Step Dependencies**: Steps 4-7
  - **User Instructions**: None

## Phase 8: Performance and Polish

- [ ] Step 9: Optimize performance and add accessibility features
  - **Task**: Optimize sorting algorithms for large datasets and add accessibility features for keyboard navigation
  - **Files**:
    - `web/src/features/widgets/utils/pivot-table-utils.ts`: Optimize algorithms
    - `web/src/features/widgets/chart-library/PivotTable.tsx`: Add accessibility attributes
  - **Step Dependencies**: Steps 2-3
  - **User Instructions**: None

- [ ] Step 10: Final testing and documentation
  - **Task**: Comprehensive testing of all features and update documentation
  - **Files**:
    - `web/src/features/widgets/README.md`: Update documentation
    - Various test files: Final comprehensive testing
  - **Step Dependencies**: All previous steps
  - **User Instructions**: None

## Implementation Summary

This condensed implementation plan breaks down the Pivot Table Sorting Feature into 10 focused steps across 8 phases:

1. **Foundation**: Core types, hooks, algorithms, and tests
2. **UI Components**: Complete sorting UI and visual integration
3. **Configuration**: Schema and form updates together
4. **Server Integration**: Complete server-side sorting implementation
5. **State Management**: Full integration and persistence
6. **Error Handling**: Comprehensive error handling and edge cases
7. **Testing**: Complete test suite across all aspects
8. **Polish**: Performance optimization and accessibility

### Key Benefits of Condensed Plan

- **Reduced Complexity**: From 25 steps to 10 focused steps
- **Logical Grouping**: Related tasks combined for efficient implementation
- **Clear Dependencies**: Each step builds on previous work
- **Atomic Implementation**: Each step can be completed in a single iteration
- **Comprehensive Coverage**: All requirements still addressed

### Dependencies

- Steps 1-2 provide the foundation for all other work
- UI components (Step 3) depend on core types and algorithms
- Server integration (Step 5) must be coordinated with client-side changes
- Testing (Step 8) validates the complete feature integration
- Final polish (Steps 9-10) ensures production readiness

The plan ensures each step is substantial enough to be meaningful while remaining manageable for implementation.
