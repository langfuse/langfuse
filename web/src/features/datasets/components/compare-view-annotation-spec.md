# Compare View Annotation Interface Specification

## User Experience

### Entry Point

- **Trigger**: "Review" button appears on dataset run item cell hover
- **Action**: Click opens annotation side panel
- **Visual**: Cell highlights to show editing state

### Side Panel Content

- Row for each annotation score configuration: (AnnotateDrawerContent)
  - Score name
  - Score input (existing UI component)
  - Comment field
- Comments section (CommentsSection)

### Interaction Behavior

- **Score edits**: Save on change, optimistic UI updates (Google Docs style)
- **Comment protection**: Cannot close panel or switch cells with unsaved comment
- **Cell switching**: Clicking another cell updates panel content (single cell active at a time)
- **Filter changes**: Close panel, clear review state
- **Navigation**: Any URL change clears state

## Technical Specification

### State Management

**ScoreAnnotationContext**

```ts
{
  // Ephemeral score overrides, cleared on unmount
  overrides: Map<scoreKey, Score>,
  setOverride: (key: string, score: Score) => void,
  clearOverrides: () => void,

  // Active cell tracking
  activeCell: { traceId: string, observationId?: string } | null,
  setActiveCell: (cell) => void,
  clearActiveCell: () => void
}
```

**Score Key Format**: `${traceId}-${observationId}-${scoreId}`

**Rationale**: Local context state sufficient for single-view, ephemeral data. No persistence needed. Cleared on refresh/navigation.

### Component Architecture

```
CompareView
  ├─ ScoreAnnotationProvider (context wrapper)
  ├─ DatasetRunItemCell
  │    └─ Review button (hover) → setActiveCell()
  ├─ SidePanel (disableManualToggle={true})
       └─ AnnotateDrawerContent (refactored)
```

### Key Implementation Details

**1. AnnotateDrawerContent Refactor**
Steps: please add pseudo code first, as we have a annoation drawer with comments and scores in the annotation queue already, ideally we can have a single annotation component, comments component; and reuse the combination of the two in a drawer or not.

- Remove Drawer wrapper assumption
- Accept `traceId`, `observationId` as direct props
- Track `hasUnsavedComment` state
- Emit to parent to block close

**2. SidePanel Enhancement**

- Add `disableManualToggle?: boolean` prop
- When true: no expand/collapse button, controlled only via `open` prop

**3. Cell Highlighting**

- Compare `cell.traceId/observationId` with `activeCell` from context
- Apply highlight CSS class on match

**4. Score Display Merge**

```ts
// In table render
const displayScore = scoreOverrides.get(scoreKey) ?? apiScore;
```

**5. Race Condition Protection**

```ts
// On cell click
setActiveCell({ traceId, observationId });
// Side panel opens and reads from context
// State updates atomic, no race
```

**6. Filter Change Detection**

- Hook into table filter state change
- On change: `clearActiveCell()` + close side panel

**7. Navigation Detection**

- Use `useEffect` with router.asPath dependency
- On change: `clearOverrides()` + `clearActiveCell()`

### Data Sources

- **Score configurations**: `api.scoreConfigs.all` (filter for annotation scores only)
- **Score update**: `api.scores.updateAnnotationScore`

### Constraints

- Only annotation scores shown/editable (exclude API/EVAL sources)
- State discarded on refresh or navigation (URL change)
- Single cell active at a time
- Unsaved comments block panel close (scores auto-save)

### Eventually Consistent Handling

Client-side merge ensures immediate UI consistency despite ClickHouse eventual consistency:

- Optimistic updates stored in context
- Display logic prefers override over API data
- Overrides cleared on navigation/refresh (re-sync with backend)

---

## AnnotationForm Refactor

### Current Problems

**AnnotateDrawerContent (`AnnotationForm`)**

- ✅ No dependency on Drawer components (removed)
- `emptySelectedConfigIds` pattern unclear - props + localStorage + noop setter
- Header logic mixed with form logic
- No callback for score updates (needed for ScoreWriteCache)
- `isDrawerOpen` prop feels off, check if removable
- File too long (~1150 lines), hard to read
- Props interface complex: generic + intersection
- Optimistic update logic complex but necessary

**AnnotateDrawer**

- `hasGroupedButton` always true, remove
- Props/types could be simplified

### Refactor Plan

Generally: all files should live in web/src/features/scores/components/...

#### 1. Header Approach

**Option A: Always pass from parent**

- Pro: Max flexibility, clear separation
- Con: Duplication across 3 call sites

**Option B: Conditional `showHeader` prop**

- Pro: Header logic centralized
- Con: Component knows context

**Option C: Remove header, wrap in parent**

```tsx
// Compare view
<AnnotationForm {...props} />

// Drawer
<>
  <DrawerHeader>...</DrawerHeader>
  <AnnotationForm {...props} />
</>
```

- Pro: Clean separation
- Con: Slight boilerplate

**Recommendation: Option C** - cleanest --> user: agree, let's go with option c

#### 2. Config Selection Pattern

**Current**: Props + localStorage + setter (confusing)

**Option A: Always controlled**

```tsx
selectedConfigIds: string[]
onSelectedConfigIdsChange: (ids: string[]) => void
```

- Pro: Standard React pattern
- Con: Parent manages state

**Option B: Optional controlled**

- Pro: Backward compat
- Con: Two code paths

**Recommendation: Option A** - clear contract -> user: always controlled is good. but extract the local storage logic to a hook and use custom hook where needed.

#### 3. Remove `isDrawerOpen`

Currently used in `useScoreMutations` for `setShowSaving` callback.

**Can remove** - replace with `!!setShowSaving` check

#### 4. Custom Hooks Extraction

```tsx
useScoreFormHandlers({
  form, fields, update, remove,
  scoreTarget, projectId, configs,
  mutations, optimisticState,
  queueId, environment, analyticsData
}) => {
  handleScoreChange,
  handleCommentUpdate,
  handleOnBlur,
  handleOnValueChange,
  handleOnCheckedChange,
}
```

**Reduces component by ~200 lines**

#### 5. Props Simplification

**Current**: `AnnotateDrawerProps<Target> & { ...7 more }`

**New `AnnotationFormProps`**:

```tsx
type AnnotationFormProps = {
  // Core data
  projectId: string
  scoreTarget: ScoreTarget
  scores: APIScoreV2[]
  configs: ScoreConfigDomain[]

  // Config selection
  selectedConfigIds: string[]
  onSelectedConfigIdsChange: (ids: string[]) => void
  hideConfigSelector?: boolean

  // Callbacks
  onScoreUpdate?: (scoreId: string, score: UpdateAnnotationScoreData) => void; (score: APIScoreV2) => void
  setShowSaving?: (saving: boolean) => void

  // Optional
  queueId?: string
  environment?: string
  actionButtons?: ReactNode

  // Analytics
  analyticsData: { type: string; source: string }
}
```

Drop generic `<Target>` - not adding value

#### 6. Additional Issues Found

- **Mutation state tracking**: Move `isSaving` logic to `useScoreMutations` hook
- **Race condition handling**: Keep pendingCreates/pendingDeletes refs, add comments
- **Form reset logic**: Replace useEffect array comparison with useMemo
- **Error handling**: Currently silent failures (optional improvement)

### Implementation Order

1. Extract `useScoreFormHandlers` hook
2. Simplify props (remove generic, flatten)
3. Remove `isDrawerOpen`, use `!!setShowSaving`
4. Move header to parent (Option C)
5. Make `selectedConfigIds` fully controlled
6. Update all 3 call sites
