# Pivot Table Sorting Feature

## Project Description

Add sorting functionality to the pivot table component to allow users to sort data by group level and within groups, with session-based persistence of sort preferences. This will enhance data analysis capabilities by enabling users to identify patterns and outliers in their trace data more effectively.

## Target Audience

- Langfuse users who analyze trace data through pivot tables
- Users who need to identify patterns and outliers in their trace data
- Data analysts who require flexible sorting options for grouped data

## Desired Features

### Core Sorting Functionality

- [ ] Implement click-to-sort on column headers
  - [ ] Sort by any column (dimensions and metrics)
  - [ ] Toggle between ascending/descending order (ASC → DESC → no sort)
  - [ ] Use existing ▲/▼ arrow indicators for sort direction
  - [ ] Apply cursor pointer styling to sortable columns
- [ ] Implement hierarchical sorting behavior
  - [ ] Sort groups by their total values first
  - [ ] Then sort individual items within each group
  - [ ] Maintain group hierarchy and indentation
- [ ] Add visual indicators for sortable columns
  - [ ] Show sort direction arrows (▲/▼) using existing pattern
  - [ ] Indicate which column is currently sorted
  - [ ] Apply subtle hover effects for sortable columns

### Persistence Feature

- [ ] Add per-widget instance persistence
  - [ ] Save sort preferences per individual widget instance
  - [ ] Restore saved preferences on page reload
  - [ ] Clear preferences when session ends
- [ ] Integrate with existing column sizing persistence system
  - [ ] Use similar pattern to `useColumnSizing` hook
  - [ ] Store sort state alongside existing table preferences

### Widget Configuration

- [ ] Add default sort configuration during widget creation
  - [ ] Integrate dropdown for default sort column and direction in widget form
  - [ ] Store default sort in widget configuration
  - [ ] Apply default sort when widget is first loaded

### Data Processing

- [ ] Implement server-side sorting before row limiting
  - [ ] Apply sorting at database level before row limit
  - [ ] Ensure correct data display in sort order with limit applied after sorting
  - [ ] Maintain compatibility with existing "Show more" functionality

### UI/UX Enhancements

- [ ] Maintain existing table styling and dark theme
  - [ ] Preserve current pivot table styling and indentation
  - [ ] Ensure sort indicators don't interfere with existing layout
- [ ] Make sorting behavior intuitive and discoverable
  - [ ] Add subtle visual cues for sortable columns
  - [ ] Ensure consistent behavior with other tables in the app

## Design Requests

- [ ] Follow existing sorting patterns from DataTable component
  - [ ] Use ▲/▼ arrows for sort indicators
  - [ ] Implement ASC → DESC → no sort cycle
  - [ ] Apply cursor pointer to sortable headers
- [ ] Maintain pivot table's hierarchical structure
  - [ ] Preserve group indentation and styling
  - [ ] Keep subtotal rows properly positioned
  - [ ] Maintain grand total row at top
- [ ] Ensure responsive design compatibility
  - [ ] Sort indicators work on mobile devices
  - [ ] Maintain table readability across screen sizes

## Other Notes

- [ ] Server-side sorting implementation
  - [ ] Implement sorting at database level before row limiting
  - [ ] Handle edge cases for equal values using existing patterns
  - [ ] Ensure sorting works with existing row limiting and "Show more" features
- [ ] Error handling
  - [ ] Silently fail if sort preferences can't be saved/restored
  - [ ] Graceful degradation when sorting fails
  - [ ] Maintain accessibility features using existing codebase practices
- [ ] Testing requirements
  - [ ] Unit tests for sorting logic
