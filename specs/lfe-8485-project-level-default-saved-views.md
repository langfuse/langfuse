# Persist Saved Views and Make Them Default for Users or Projects

linear issue: https://linear.app/langfuse/issue/LFE-8485/settings-saved-views-default-for-users-or-projects

## What?

Filters become important to tables and e.g. the session view in order to see the correct data from just observations.
Various customers have different data structures, and thus need personalized views.
Not all people will want to invest into creating views, it should just work.
If someone clicks on a session link for example, the right view should show up.

Therefore, users can create saved views and set them as default personally but also for an entire project.

Resolution order of views:
1. URL `viewId` query param (permalink)
2. Session storage (temporary selection)
3. User's personal default for view
4. Project default for view
5. System default (i.e. a `__langfuse__` preset)
6. No view applied (show all data)

in a future version, a project default could take precedence if it was created after the user set their default.

## How?

We save saved views to postgres.
The currently selected view is saved in session storage only.

The user can set a default view.

A hook checks default settings on page load (potentially cached to local storage) and then applies the saved view on load.
The hook gets data from a new tRPC query, to get default state.

### Postgres table to hold view defaults

The following new tables holds the default settings.

With this, relationships and uniqueness constrains are clean in the database, deletes and updates to the defaults are very easy and we could also track who set/unset something as default.
```prisma
model DefaultView {
    id        String   @id @default(cuid())
    createdAt DateTime @default(now()) @map("created_at")
    updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

    projectId String  @map("project_id")
    project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

    userId    String? @map("user_id")
    user      User?   @relation(fields: [userId], references: [id], onDelete: Cascade)

    viewName  String  @map("view_name")  // e.g. "traces", "sessions", "session-detail"
    viewId    String  @map("view_id")    // no FK - allows system presets (e.g. __langfuse_*)

    // Uniqueness enforced via partial indexes in migration (not expressible in Prisma)
    // - User defaults: UNIQUE(project_id, user_id, view_name) WHERE user_id IS NOT NULL
    // - Project defaults: UNIQUE(project_id, view_name) WHERE user_id IS NULL
    // this is because we need to support postgres v12
    @@index([projectId, viewName])
    @@map("default_views")
  }
```

### Schema Caveats

1. **NULL uniqueness:** Enforced via partial unique indexes in raw SQL migration (Prisma can't express this). One index for user defaults (`WHERE user_id IS NOT NULL`), one for project defaults (`WHERE user_id IS NULL`).

2. **No FK on viewId:** Intentionally omitted to allow system presets (e.g. `__langfuse_last_generation__`) to be set as defaults. Orphan cleanup needed if a user-created view is deleted while set as default.

### tRPC Updates

#### Queries

- `tableViewPresets.getDefault`
  - Input: `{ projectId, viewName }`
  - Returns: resolved default view (user default → project default → system default → null)
  - Called on page load, cached through tRPC stale time of 5mins, accessed through hook
  - Cache invalidated on any default mutation via tRPC

#### Mutations

- `tableViewPresets.setAsDefault`
  - Input: `{ projectId, viewId, viewName?, scope: 'user' | 'project' }`
  - `viewName` optional - if not passed, inferred from viewId lookup (required for system presets)
  - Clears existing default for that scope, sets new one

- `tableViewPresets.clearDefault`
  - Input: `{ projectId, viewName, scope: 'user' | 'project' }`
  - Removes default without setting a new one

### RBAC

| Action | Permission |
|--------|------------|
| Set/clear user default | Any project member |
| Set/clear project default | Requires `TableViewPresets:CUD` scope |

### UI

- Default actions in view drawer (set as my default / set as project default / clear) -> not changed from current implementation, will do in v2
- Badge on view indicating "Your default" / "Project default"
- System presets (`__langfuse_*`) can be set as defaults (they have stable IDs)

## Questions

1. what happens if a user deletes a project default view? -> we show a little warning popup that it would be removed for all users, then, on confirmation, it will be removed for all users.
2. what happens if a user is deleted who set an org default view? -> the default view just remains in place. can still be edited by other users.
3. what happens if a view that's set as default gets deleted? -> no FK, so need manual cleanup in delete mutation. Remove default rows referencing deleted viewId.
