# Multi-Breakdown Charts

## Project Description

Allow up to 2 breakdown dimensions in Langfuse charts that currently support single breakdowns (line charts, bar charts, pie charts). This enables users to analyze data with multiple categorical breakdowns simultaneously, building on the existing single-breakdown functionality.

**Example Use Cases:**

- **Trace Performance Analysis**: View latency by environment (production/staging) AND model name (GPT-4/Claude) to identify environment-specific model performance issues
- **Error Rate Monitoring**: Analyze error counts by trace name AND user type to spot patterns in specific operations for certain user segments
- **Cost Analysis**: Track token usage by release version AND environment to understand cost implications of deployments across different stages

## Target Audience

- Data scientists and ML engineers analyzing trace performance patterns
- Product managers tracking metrics across multiple categorical dimensions
- DevOps teams monitoring system behavior across environments, users, and trace types

## Desired Features

### Core Functionality (Limit: 2 dimensions)

- [ ] Extend time-series charts (LINE_TIME_SERIES, BAR_TIME_SERIES) to support 2 breakdown dimensions
- [ ] Extend total-value charts (HORIZONTAL_BAR, VERTICAL_BAR, PIE) to support 2 breakdown dimensions
- [ ] Maintain backward compatibility - existing single-breakdown charts work automatically
- [ ] Extend existing query logic to handle 2-dimensional aggregation
- [ ] Support all current dimension types (environment, trace name, model name, user, tags, etc.)

### UI/UX Enhancements

- [ ] Replace single dimension dropdown with multiple dropdowns
- [ ] Clear visual separation between multiple breakdown dimensions (progressive disclosure)
- [ ] Enhanced chart legends showing dimension combinations

### Chart-Specific Visual Implementation

**Phase 1 (Easy Implementation):**

- [ ] **Bar Charts**: Implement grouped bars - first dimension groups bars, second dimension creates sub-bars within groups
- [ ] **Pie Charts**: Nested Donut - Inner ring shows first dimension, outer ring shows second dimension breakdown

**Phase 2 (More Complex):**

- [ ] **Line Charts**: Use different line styles/colors for dimension combinations (e.g., solid/dashed lines + colors)

**All Charts:**

- [ ] Show empty data segments/combinations (don't hide sparse data)
- [ ] Limit total combinations to prevent visual clutter (auto-limit based on data)

## Design Requests

- [ ] **Multi-Dimension Interface**
  - [ ] Use unified dimension selection UI - same as pivot tables (up to N configurable dimensions)
  - [ ] Clear labels for "Dimension 1", "Dimension 2", etc. (dynamically generated)
  - [ ] Maintain "None" option for all dropdowns
  - [ ] Sequential enabling: each dropdown only enabled when previous dimension is selected

- [ ] **Enhanced Chart Legends**
  - [ ] For line charts: Legend shows "Environment-Model" combinations with corresponding line style/color
  - [ ] For bar charts: Hierarchical legend showing dimension groupings and sub-groups
  - [ ] For pie charts:
    - [ ] **Nested Donut**: Two-level legend showing inner ring (first dimension) and outer ring (second dimension)
  - [ ] Auto-collapse legend if >10 combinations to prevent UI overflow

- [ ] **Visual Design Consistency**
  - [ ] Use existing Langfuse color palette, extend with patterns/styles for additional dimensions
  - [ ] Consistent interaction patterns across all chart types
  - [ ] Clear visual hierarchy between dimension levels (first dimension more prominent)

## Technical Implementation Notes

- [ ] **Implementation Phases**
  - [ ] **Phase 1**: Start with bar charts (grouped bars straightforward) and pie charts (combined labels simple)
  - [ ] **Phase 2**: Implement line charts (more complex line style/color combinations)
  - [ ] **Phase 3**: Extend to time-series variants if needed

- [ ] **Extend Existing Architecture**
  - [ ] Modify `WidgetForm.tsx` multi-select for dimensions (similar to pivot table approach)
  - [ ] Update `groupDataByTimeDimension` utility to handle 2 dimensions
  - [ ] Extend chart data processing to create combined dimension keys
  - [ ] Update query builder to generate multi-dimensional GROUP BY clauses

- [ ] **Data Handling**
  - [ ] Show empty data segments (don't filter out sparse combinations)
  - [ ] Create combined dimension keys (e.g., "production|gpt-4", "staging|claude")
  - [ ] **Data Export**: Support CSV/JSON export with multi-dimension columns (e.g., "Dimension 1", "Dimension 2", "Metric Value")
  - [ ] Use existing warning system for large datasets (>2000 combinations)

- [ ] **Performance Considerations**
  - [ ] Set hard limit of 2 dimensions maximum
  - [ ] Use existing data limiting logic (already handles 2000+ data points warning)
  - [ ] Leverage existing query optimization patterns

- [ ] **Backward Compatibility**
  - [ ] Existing single dimension charts should work without changes
  - [ ] Existing widget configurations should load correctly
  - [ ] Database schema changes should be minimal/none

- [ ] **Testing Strategy**
  - [ ] Server-side tests for multi-dimensional query generation (if necessary)
  - [ ] No UI tests required - rely on existing testing patterns
