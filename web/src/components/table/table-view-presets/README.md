# Table View Presets

This module provides a flexible and robust way to manage and persist table states across sessions. Users can save, load, and share specific table configurations including column visibility, ordering, filters, and search queries.

Users can now:

- Save current table state as a named view
- Select table view presets from the dropdown
- Update existing views. Please note that we do not currently detect drift between the view definition and the table state but show the update button at all times, even if there is no drift.
- Delete views they no longer need
- Generate permalinks to share specific views

The My Views button displays only the selected custom view's name, including
a default applied on page load. Categorized patterns show their selection in
the pattern controls instead. `TableViewPresetsButton` owns this presentation;
the drawer resolves the name and default assignment from its existing queries.

On Tracing, editing filters, search, sorting, or columns clears the selected
view from the URL and session. No-op edits and automatic reconciliation preserve
selection. Incomplete sidebar inputs survive deselection; applying a view resets
them through `filterEditorResetKey`. A separate `viewUpdateTarget` keeps the
original view available for updating without marking it active, including the
column-provenance guard for shared links. It also preserves the edited working
view across reloads instead of reapplying a default.

Search scopes are saved alongside `searchQuery` in `searchType`. Hosts with
scope controls pass `currentSearchType` to the toolbar (or `searchType` in a
custom drawer's `currentState`) and provide `stateUpdaters.setSearchType` to the
manager. Older views with no stored scopes leave the host's current/default
scope unchanged. Permalinks restore both values through the saved `viewId`.

## Robustness to Table Changes

The table view presets system is designed to gracefully handle changes to table structure:

### Column Changes

- **Removed columns**: If a column in a saved view no longer exists, it's simply ignored in column ordering and visibility
- **Renamed columns**: These are treated as different columns - the old one is ignored
- **Added columns**: New columns don't affect existing views but will appear based on default visibility

### Filter Changes

- **Removed filter columns**: Filters referring to columns that no longer exist are automatically filtered out when applying the view
- **Changed filter definitions**: The system validates filters against current column definitions
- **Warning notification**: Users are shown a warning toast if filters were ignored, suggesting to update the view

### OrderBy Changes

- **Invalid sort columns**: If a saved orderBy uses a column that no longer exists or is no longer sortable, it defaults to no sorting
- **Warning notification**: Similar to filters, a warning is shown when orderBy couldn't be applied

### Default Validation

Validation context is optional, and the system will apply table view presets even if validation parameters aren't provided, allowing for gradual adoption.

## Graceful Degradation

The system prioritizes keeping the application functional even when views are problematic:

### Invalid Views

When a view's state can't be fully applied:

1. The system applies what it can (e.g., valid columns and filters)
2. Invalid portions are ignored
3. A warning toast notifies the user, prompting them to update the view
4. The application continues functioning

### Deleted Views

If a user navigates to a permalink for a deleted view:

1. The view loading will fail gracefully
2. Default table settings are applied
3. No error is shown to the user
4. The URL parameter remains but has no effect, and the session storage is cleared if the view is not found

## Permalink Feature

The permalink functionality allows users to share specific table configurations:

```typescript
// Generate and copy permalink
generatePermalinkMutation.mutate({
  viewId: view.id,
  projectId,
  tableName,
  baseUrl: window.location.origin,
});
```

When a user visits a permalink:

1. The URL contains a `viewId` parameter
2. The system loads the view automatically on page load
3. The view ID is stored in session storage for persistence across page navigations
4. The specified view's configuration is applied to the table

## File Structure

```
web/src/components/table/table-view-presets/
├── components/
│   ├── data-table-table-view-presets-drawer.tsx # Main UI component for table view presets
├── hooks/
│   ├── useTableViewManager.ts    # Core hook for managing view state
│   ├── useViewData.ts            # Hook for retrieving table view presets
│   └── useViewMutations.ts       # Hook for mutation operations (create, update, delete)
```

Additional related files:

```
packages/shared/src/domain/table-view-presets.ts      # Type definitions
packages/shared/src/server/services/TableViewService/ # Server-side handling
```

The implementation uses a combination of:

- **URL parameters** for sharing views
- **Session storage** for persistence across navigation
- **Database storage** for permanent view saving
- **Validation logic** for backwards compatibility

By focusing on robustness and graceful degradation, the table view presets feature provides a reliable experience even as tables evolve over time.

## Example Usage

```typescript
// 1. In your table component, set up the view manager
const {
  isLoading: isViewLoading,
  applyViewState,
  handleSetViewId,
  selectedViewId
} = useTableViewManager({
    tableName: TableViewPresetTableName.Traces,
    projectId,
    stateUpdaters: {
    setOrderBy,
    setFilters,
    setColumnOrder,
    setColumnVisibility,
    setSearchQuery,
  },
  validationContext: {
    columns: columns,
    filterColumnDefinition: filterColumnDefinition,
  },
});

// 2. Pass the view configuration to the DataTableToolbar
<DataTableToolbar
  viewConfig={{
    tableName: TableViewPresetTableName.Traces,
    projectId,
    controllers: {
      selectedViewId,
      handleSetViewId,
      applyViewState,
    },
  }}
// Other props...
/>

// 3. Add loading state to DataTable
<DataTable
  data={
    isLoading || isViewLoading
    ? { rows: [], rowCount: 0 }
    : { rows: data, rowCount: totalCount }
  }
// Other props...
/>
```
