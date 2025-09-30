# Skipped Facet Types

This document describes complex filter column types that were not implemented in the initial faceted sidebar migration. These facet types require more sophisticated UI components and filtering logic.

## Overview

During the migration of data tables to the new faceted sidebar system, we implemented support for the following facet types:
- **Categorical** (`stringOptions`, `string`): Multi-select checkboxes for discrete values
- **Boolean**: Toggle between true/false states with configurable labels
- **Numeric** (`number`): Min/max range sliders with optional units

However, several advanced column types found in our table definitions were skipped and will need custom implementations.

## Skipped Types

### 1. `stringObject`

**Description**: Key-value object where both keys and values are strings, used primarily for metadata filtering.

**Example columns**:
- `metadata` (traces, observations)

**Current behavior**: Not filterable in the new sidebar

**Future implementation considerations**:
- UI could show a key-value pair input form
- Support for filtering by key existence, key-value pairs, or nested path queries
- Could use JSON path syntax for complex queries

### 2. `numberObject`

**Description**: Key-value object with numeric values, used for aggregated scores.

**Example columns**:
- `scores_avg` (traces, observations, sessions)

**Current behavior**: Not filterable in the new sidebar

**Future implementation considerations**:
- Similar to `stringObject` but with numeric value inputs
- Could show list of known score names with numeric range inputs
- Might need API support to fetch available score names dynamically

### 3. `categoryOptions`

**Description**: Multi-level categorical data with subcategories.

**Example columns**:
- `score_categories` (traces, observations, sessions)

**Current behavior**: Not filterable in the new sidebar

**Future implementation considerations**:
- Hierarchical checkbox UI or nested dropdowns
- Support for filtering by category and subcategory combinations
- Example: `score_name:category_value`

### 4. `arrayOptions` (Complex cases)

**Description**: Arrays of strings that require special handling beyond simple categorical filters.

**Example columns**:
- `tags` (traces, observations, sessions, scores) - partially implemented as categorical
- `userIds` (sessions) - partially implemented as categorical

**Current behavior**: Implemented as simple categorical facets in most cases

**Note**: While `arrayOptions` columns like `tags` and `userIds` are currently shown as categorical facets in the sidebar, they may benefit from enhanced UI in the future (e.g., tag-specific autocomplete, multi-select with "all of" vs "any of" operators).

## Implementation Priority

Recommended order for future implementation:

1. **Enhanced `arrayOptions`** - Add "all of" operator support (currently only "any of" is supported)
2. **`numberObject`** - Scores filtering is a common use case
3. **`categoryOptions`** - Score categories are important for evaluation workflows
4. **`stringObject`** - Metadata filtering is powerful but can remain in the advanced filter builder for now

## Related Files

- Facet type definitions: `/web/src/features/filters/lib/filter-config.ts`
- Filter encoding logic: `/web/src/features/filters/lib/filter-query-encoding.ts`
- Sidebar components: `/web/src/components/table/data-table-controls.tsx`
- Table column definitions:
  - Traces: `/packages/shared/src/tracesTable.ts`
  - Observations: `/packages/shared/src/observationsTable.ts`
  - Sessions: `/packages/shared/src/tableDefinitions/sessionsView.ts`
  - Scores: `/web/src/server/api/definitions/scoresTable.ts`

## Migration Status

✅ **Completed tables**:
- **Traces** (11 facets: 1 boolean, 4 categorical, 6 numeric)
- **Observations/Generations** (16 facets: 8 categorical, 8 numeric)
- **Sessions** (9 facets: 1 boolean, 8 numeric)
- **Scores** (4 facets: 3 categorical, 1 numeric)
- **Prompts** (4 facets: 3 categorical, 1 numeric)
- **Evaluators** (2 facets: 2 categorical)

All data exploration tables now use the new faceted sidebar for supported facet types. Complex types remain accessible through the legacy filter builder interface where needed.

**Non-migrated tables** (insufficient filtering requirements for sidebar):
- **Users** - Only has userId filter which is better served by search functionality
- **Annotation Queues** - Simple list table with no filter requirements
- **Models** - Settings table with no filters
- **Score Configs** - Settings table with no filters
- **Eval Templates** - List view with no filters