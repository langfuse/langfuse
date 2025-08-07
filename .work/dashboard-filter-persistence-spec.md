# Dashboard Filter Persistence - Technical Specification

## Overview

Enable users to save and persist dashboard-level filters so they can create dedicated views like "user-1 dashboard" and "user-2 dashboard" that automatically apply specific filters when opened. These filtered dashboards should be shareable across team members.

## Current State Analysis

### Current Implementation

- Dashboard filters are stored in **session storage only** using `useQueryFilterState` hook
- Filters are stored with key: `dashboard-${projectId}FilterState`
- Each dashboard page (`/dashboards/[dashboardId]`) uses local React state (`userFilterState`) that gets reset on every page load
- Filters are not persisted in the database at all
- The main dashboard page (`/project/[projectId]/index.tsx`) does persist filters in session storage, but individual dashboard pages don't

### Database Schema (Current)

- `Dashboard` table exists with `definition` JSON field that stores widget placements
- `DashboardWidget` table has a `filters` JSON field for widget-specific filters
- No dashboard-level filter persistence currently

### Problem Statement

- Dashboard filters reset on every page reload/navigation
- Filters only persist in browser session storage (lost when session ends)
- No way to share filtered dashboard views with team members
- Users must manually re-apply filters each time they visit a dashboard

## Product Requirements

### Core Features

1. **Persistent Filters**: Dashboard-level filters are saved to database and automatically applied on load
2. **Team Sharing**: Saved filtered dashboards work for all team members with access
3. **Temporary Override**: Users can temporarily modify filters without permanently changing saved state
4. **Save Control**: Explicit "Save Filters" action to persist current filter state

### User Experience Flow

1. **Dashboard Load**: User visits dashboard → Saved filters are automatically applied
2. **Filter Modification**: User changes filters → Temporary override with visual indication
3. **Save Action**: User clicks "Save Filters" → Current state persisted to database
4. **Reset Behavior**: Page refresh → Revert to saved filters

## Technical Implementation

### Database Changes

#### Schema Updates

```sql
-- Add filters column to existing dashboards table
ALTER TABLE "dashboards" ADD COLUMN "filters" JSONB DEFAULT '[]'::jsonb;
-- Add date range persistence for relative ranges only
ALTER TABLE "dashboards" ADD COLUMN "date_range" TEXT DEFAULT NULL;
```

#### Data Model

- `filters`: JSON array of FilterState objects (same format as current session storage)
- `date_range`: String representation of relative date ranges ("7 days", "30 days", etc.)

### TypeScript Schema Updates

#### Dashboard Domain Schema

```typescript
// Update packages/shared/src/server/services/DashboardService/types.ts
export const DashboardDomainSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  projectId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  definition: DashboardDefinitionSchema,
  filters: z.array(singleFilter).default([]), // NEW
  dateRange: z.string().nullable().default(null), // NEW
  owner: OwnerEnum,
});
```

### API Changes

#### Dashboard Router Updates

```typescript
// Update web/src/features/dashboard/server/dashboard-router.ts

// New input schema for updating filters
const updateDashboardFiltersInput = z.object({
  projectId: z.string(),
  dashboardId: z.string(),
  filters: z.array(singleFilter),
  dateRange: z.string().nullable(),
});

// New endpoint
updateDashboardFilters: protectedProjectProcedure
  .input(updateDashboardFiltersInput)
  .mutation(async ({ input, ctx }) => {
    // Implementation
  }),
```

### Frontend Implementation

#### Dashboard Detail Page Changes

File: `web/src/pages/project/[projectId]/dashboards/[dashboardId]/index.tsx`

**State Management:**

```typescript
// Replace current userFilterState with:
const [savedFilters, setSavedFilters] = useState<FilterState>([]);
const [currentFilters, setCurrentFilters] = useState<FilterState>([]);
const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
const [savedDateRange, setSavedDateRange] = useState<string | null>(null);
```

**Key Behaviors:**

1. **Load saved filters**: Apply `dashboard.data.filters` on dashboard load
2. **Track changes**: Compare `currentFilters` vs `savedFilters` to show unsaved state
3. **Temporary override**: Allow filter modifications without immediate persistence
4. **Save action**: Explicit button to persist current state

#### UI Components

**Save Filters Button:**

```typescript
const SaveFiltersButton = () => {
  const hasChanges = hasUnsavedChanges;

  return (
    <Button
      onClick={handleSaveFilters}
      disabled={!hasChanges || saveMutation.isLoading}
      variant={hasChanges ? "default" : "ghost"}
    >
      {saveMutation.isLoading ? "Saving..." : "Save Filters"}
    </Button>
  );
};
```

**Filter Visual Indicators:**

- Saved filters: Standard appearance when matching saved state
- Modified filters: Visual distinction (border, background) when temporarily overridden
- Loading states during save operations

### Filter Persistence Rules

#### Scope

- **All filter types**: Environment, user, trace name, tags, metadata, release, version, etc.
- **Relative date ranges only**: "7 days", "30 days", "90 days" - no manual date selections

#### Permissions

- **Edit filters**: Anyone with `dashboards:CUD` permission on the dashboard
- **View filters**: Anyone with dashboard view access

#### Override Behavior

- **Temporary changes**: Manual filter modifications override saved filters temporarily
- **Persistence**: Changes only saved when user explicitly clicks "Save Filters"
- **Reset mechanism**: Page refresh reverts to saved filters

#### Migration Strategy

- **Existing dashboards**: Start with empty saved filters (`filters: []`, `dateRange: null`)
- **No data migration**: Don't migrate session storage data to database
- **Backward compatibility**: All existing functionality continues to work

### Performance Considerations

#### Debounced Saves

- Use existing `saveDashboardChanges` pattern for filter persistence
- 600ms debounce for save operations
- Optimistic UI updates with error handling

#### Query Optimization

- Include filters in existing dashboard queries (no additional requests)
- Leverage existing dashboard caching strategies

## Implementation Tasks

### Phase 1: Database & Types

1. **Database Migration**: Add `filters` and `date_range` columns
2. **Schema Updates**: Update `DashboardDomainSchema` and related types
3. **API Extensions**: Add filter persistence to dashboard endpoints

### Phase 2: Frontend Core

4. **Dashboard Page**: Replace local filter state with persistent filters
5. **State Management**: Implement saved vs current filter tracking
6. **Filter Loading**: Auto-apply saved filters on dashboard load

### Phase 3: UI & UX

7. **Save Button**: Add "Save Filters" button with proper states
8. **Visual Indicators**: Show saved vs modified filter states
9. **Date Range Logic**: Implement relative date range persistence

### Phase 4: Testing & Polish

10. **Permission Checks**: Ensure proper RBAC for filter modifications
11. **Error Handling**: Graceful handling of save failures
12. **Edge Cases**: Handle empty dashboards, invalid filters, etc.

## Success Criteria

### Functional Requirements

- ✅ Dashboard filters persist across sessions
- ✅ Saved filters automatically apply on dashboard load
- ✅ Users can temporarily modify filters without permanent changes
- ✅ "Save Filters" button persists current state
- ✅ Page refresh resets to saved filters
- ✅ Relative date ranges are persisted
- ✅ Team members see same saved filters

### Technical Requirements

- ✅ No breaking changes to existing dashboard functionality
- ✅ Proper RBAC enforcement
- ✅ Performant filter loading and saving
- ✅ Backward compatibility with existing dashboards

### User Experience Requirements

- ✅ Clear visual distinction between saved and modified filters
- ✅ Intuitive save/reset behavior
- ✅ Loading states during save operations
- ✅ Error handling with user feedback

## Future Considerations

### Potential Enhancements

- **Named Filter Sets**: Allow multiple saved filter configurations per dashboard
- **Filter Templates**: Share common filter patterns across dashboards
- **Filter History**: Track changes to saved filters over time
- **Advanced Permissions**: Granular control over who can modify vs view filters

### Technical Debt

- **Session Storage Cleanup**: Consider deprecating session storage for dashboard filters
- **Filter State Consolidation**: Unify filter persistence patterns across all table views
- **Performance Optimization**: Implement filter result caching for common configurations
