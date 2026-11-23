# Saved dashboard blocks

With the employee authoring preview enabled and permission to edit the dashboard, choose **Add widget → New multi-query chart** to compare independently filtered populations. Use **Add series** for the second population, name each one, and choose a chart type in the live preview. Save the chart to this dashboard. Choose **Add widget → Markdown** to place an explanation above a chart row. Everyone with access to the dashboard can read the saved chart or note. The employee preview controls who can author them.

![A Markdown note explains the two independently filtered metadata counts above a row of classic charts.](./docs/project-dashboard.png)

![The live multi-query editor with two metadata populations and a visual chart picker.](./docs/chart-editor.png)

## Implementation

`useDashboardBlocksData` loads saved blocks independently of the employee’s authoring permissions and supplies placement labels. `DashboardBlocksProvider` owns editor opening. The save/remove hooks in `useDashboardBlockMutations` own cache invalidation. `DashboardBlockEditor` owns revision-aware save inputs. `DashboardBlockCard` renders Markdown or the multi-query chart and owns removal confirmation. Markdown uses the existing safe Markdown renderer and design-system form fields backed by React Hook Form.

`DashboardBlocksAddControl` is the context-free Add widget view; `DashboardBlocksAddMenu` connects dashboard state. It preserves the classic Add widget flow for users outside the preview. `DashboardBlockPlacement` supports existing string placement IDs.

`DashboardBlocksCanvas` interleaves blocks before the anchored chart row. `block-layout.ts` groups overlapping rows without changing saved geometry. Layout editing renders one original `DashboardGrid`, preserving cross-row drag and resize. Missing anchors fall back after the grid. Dashboards without saved blocks use the original grid.

The `multi-query/` subtree owns its query editor, execution, preparation, and chart presentation. The server checks the personal authoring flag and existing dashboard permissions for block mutations. Editor content is masked in session replay. Instrumentation records structural interactions and counts.

## Employee rollout and migration

Deploy the PostgreSQL migration `20261123160000_add_dashboard_blocks` first. It adds the `DashboardBlockKind` enum and an empty `dashboard_blocks` table. The primary key is `(dashboard_id, id)`. Each row stores its kind, versioned JSON configuration, optional placement anchor, edit revision and creation time. The dashboard foreign key cascades on deletion. Existing dashboards, widgets, Home cards and their saved grid JSON require no updates. There is no backfill or ClickHouse migration.

Once every web replica supports the new table and clone path, staff can opt in from their account menu. Select **Internal view** under **View mode**, then open **Feature preview** and enable **Dashboard block authoring** (`dashboardBlockAuthoring`). As in Topics, staff eligibility uses the account email's exact domain, `@langfuse.com` or `@clickhouse.com`, case-insensitively. Self-hosted installations use the same email-domain convention. The preview defaults off. After enrollment, authoring works in either view on dashboards the employee can edit. Staff can opt out in either view and re-enroll in Internal view. Ordinary readers retain access to the saved blocks. Organization defaults and deployment-wide experimental settings cannot grant block authoring.

| Person opening a project dashboard                         | Can see saved charts and Markdown | Can add, edit, move or remove blocks |
| ---------------------------------------------------------- | --------------------------------- | ------------------------------------ |
| Employee opted in, with dashboard edit permission          | Yes                               | Yes                                  |
| Employee opted out, or another authorized dashboard reader | Yes                               | No                                   |
| Person without dashboard read permission                   | No                                | No                                   |

![An unflagged project member sees the saved observation count, the Markdown note, and a classic Home card.](./docs/reader-without-preview.png)

The existing dashboard read includes a presence hint so an ordinary classic dashboard can load without a separate block-list request. A new client pointed at a pre-feature server falls back to the classic dashboard. Older application versions continue to read and save the original grid. Rolling the application back hides blocks on those binaries but preserves their rows for a later upgrade. Leave the additive migration in place.

A block refers to an existing chart placement or the end of the dashboard. If its anchor disappears, it displays at the end. Upgraded same-project clones include stored blocks and revisions are checked on updates. A clone created by a pre-feature server contains only the classic grid. The classic JSON export and existing public dashboard definition also represent the original grid.

Multi-query schedules up to five ordinary analytics queries per chart. For example, an observation containing both `metadata.abc` and `metadata.bbc` contributes to both independently filtered counts. Compatible presentation changes reuse existing results. Abandoned v4 streams can be aborted. On the legacy transport an already submitted request retains its concurrency slot until it settles.

## Evolving a definition

`kind` selects the editor. `config.version` identifies the persisted format for that kind. `revision` counts successful edits to one saved block and prevents stale writes. A Markdown edit can move revision 6 to 7 while the format stays at version 1. The analytics API read version (`v1`/`v2`) separately selects a data source at query time.

Bump the format when an older editor could discard a saved option or change its meaning. For example, a new percentile label that exists only in the editor UI can reuse the format. A new persisted member that describes a formula needs a version that understands the member. Introduce readers for both formats before turning on a newer writer. Convert one definition at a time on an explicit save, or use a measured migration for a later rollout. Existing classic widgets require no rewrite.

A reader skips an unsupported block version. An individual update or removal also checks the stored format and edit revision before changing the row. Same-project clones on upgraded servers copy each config as stored, including formats the running server cannot display. Unversioned pilot Markdown is read as version 1. New Markdown and multi-query writes carry an explicit version.
