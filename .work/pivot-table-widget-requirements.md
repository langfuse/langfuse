# Pivot Table Widget Implementation for Self-Serve Dashboards

## Project Description

Add a new "Pivot Table" widget type to the existing Langfuse dashboard system, enabling users to create grouped tables with configurable row dimensions (0-2) and metrics. This will extend the current widget system (which supports line charts, bar charts, pie charts, etc.) to include tabular data visualization with optional grouping and Pivot capabilities using a simple dropdown-based configuration interface.

## Target Audience

- Langfuse users creating custom dashboards
- Data analysts wanting to explore multi-dimensional data relationships
- Users who need tabular representations of their trace, observation, and score data

## Desired Features

### Core Functionality

- [ ] Add PIVOT_TABLE as a new chart type in the widget system
- [ ] Support 0-N configurable row dimensions via dropdowns
- [ ] Metrics always displayed as table columns
- [ ] Support single-row table (no dimensions, just aggregated metrics labeled "Total")
- [ ] Support single-level grouping (1 dimension with subtotals)
- [ ] Support two-level nested grouping (2 dimensions with indentation, subtotals for first dimension only)
- [ ] Integrate with existing query builder and data model
- [ ] Display subtotals and grand totals as rows
- [ ] Limit display to top 20 data rows (before adding total rows)

### Configuration Interface

- [ ] First row dimension selector (dropdown, optional)
- [ ] Second row dimension selector (dropdown, optional, only shown if first is selected)
- [ ] Metrics selector (reuse existing multi-metric support)
- [ ] Standard widget configuration (name, description, filters, date range)
- [ ] Live preview during configuration (like other widgets)
- [ ] No special validation beyond existing widget validation
- [ ] Appears in same chart type selector as other chart types

### Data Processing

- [ ] Transform query results into grouped table format
- [ ] Handle 0-N dimension scenarios
- [ ] Handle missing data/null values as empty cells
- [ ] Support same data sources as other widgets (traces, observations, scores)
- [ ] Generate subtotal rows for first dimension only (when 2 dimensions selected)
- [ ] Generate grand total row
- [ ] Apply top 20 row limit to data rows before adding totals

### Table Structure

- [ ] Columns: Always the selected metrics (Count, Average, etc.)
- [ ] Rows: 0-N nested dimensions with subtotal/total rows
- [ ] No dimensions: Single row labeled "Total"
- [ ] One dimension: Groups with subtotals and grand total
- [ ] Two dimensions: First dimension groups with subtotals, second dimension rows indented, grand total
- [ ] Second-level rows indented under first dimension
- [ ] Empty cells displayed as empty (no placeholder text)
- [ ] Subtotal rows appear after each first-dimension group
- [ ] Grand total appears at bottom

## Design Requests

- [ ] Table should follow existing dashboard design system
- [ ] Responsive layout that works within dashboard grid
- [ ] Second-level rows indicated by indentation
- [ ] Subtotal and total rows styled with bold text
- [ ] Consistent styling with other dashboard components
- [ ] Reuse existing table components where possible

## Other Notes

- Maximize code reuse with existing widget system
- Follow same configuration patterns as other chart types
- Integration with existing filter and date range controls
- Use existing QueryBuilder infrastructure
- Top 20 data row limitation to prevent performance issues
- Maximum 2 dimensions keeps complexity manageable
