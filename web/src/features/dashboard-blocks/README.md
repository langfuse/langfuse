# Saved dashboard widgets

With the employee authoring preview enabled and permission to edit the dashboard, choose **Add widget → New multi-query chart** to compare independently filtered populations. Use **Add series** for the second population, name each one, and choose a chart type in the live preview. Add a formula to calculate a ratio from the returned series. Use **Add tab** when another chart needs its own queries, units or visualization. Save the widget to this dashboard. Choose **Add widget → Markdown** to place an explanation above a chart row. Everyone with access to the dashboard can read the saved chart or note. The employee preview controls who can author them. Hover over a widget to edit or duplicate it. Keyboard focus reveals the same actions, and touch screens show them directly. Duplicating a widget saves an independent copy in the same chart section, including every tab, formula, or Markdown field.

## Implementation

`useDashboardBlocksData` loads saved inline widgets independently of the employee’s authoring permissions and supplies placement labels. `DashboardBlocksProvider` owns editor opening. The save/remove hooks in `useDashboardBlockMutations` own cache invalidation. `DashboardBlockEditor` owns revision-aware save inputs. `DashboardBlockCard` renders Markdown or the multi-query chart and owns removal confirmation. Markdown uses the existing safe Markdown renderer and design-system form fields backed by React Hook Form.

`DashboardBlocksAddControl` is the context-free Add widget view; `DashboardBlocksAddMenu` connects dashboard state. It preserves the classic Add widget flow for users outside the preview. `DashboardBlockPlacement` supports existing string placement IDs.

`DashboardBlocksCanvas` places each inline widget before its anchored chart row. `block-layout.ts` groups overlapping rows without changing saved geometry. Layout editing renders one original `DashboardGrid`, preserving cross-row drag and resize. Missing anchors fall back after the grid. Dashboards containing only classic widgets use the original grid.

The `multi-query/` subtree owns its query editor, execution, preparation, and chart presentation. The server checks the personal authoring flag and existing dashboard permissions for widget mutations. Editor content is masked in session replay. Instrumentation records structural interactions and counts.

## Employee rollout and migration

This release uses the existing PostgreSQL `dashboards.definition` JSON column. It requires no database migration, backfill or ClickHouse changes.

When the upgraded app reads a classic `{ "widgets": [...] }` dashboard, it presents the classic placements in the version 1 definition in memory. The read leaves the stored definition and its update timestamp untouched. Editing the layout or adding a widget writes the root version `"1"` and both arrays, even if the edit only moves a classic card. This works for dashboards created by an older server during a rolling deployment. Newly created dashboards on upgraded servers can write v1 immediately. The `blocks` array holds every supported placement. The `widgets` array mirrors the classic charts and presets that older readers can display. For example, a dashboard with a Home card and a note can be stored as follows.

```json
{
  "version": "1",
  "widgets": [
    {
      "type": "preset",
      "id": "traces",
      "presetId": "home-traces",
      "x": 0,
      "y": 0,
      "x_size": 12,
      "y_size": 5
    }
  ],
  "blocks": [
    {
      "type": "preset",
      "id": "traces",
      "presetId": "home-traces",
      "x": 0,
      "y": 0,
      "x_size": 12,
      "y_size": 5
    },
    {
      "id": "90426bdb-2e6f-494b-b306-b048beeae938",
      "kind": "markdown",
      "config": {
        "version": 1,
        "title": "Traffic",
        "content": "The chart counts traces in the selected period."
      },
      "revision": 1,
      "beforePlacementId": "traces"
    }
  ]
}
```

The dashboard router accepts either the original layout or a single widget edit through `updateDashboardDefinition`. A widget edit locks the dashboard row, compares the saved widget revision, then patches that widget. Two editors can update different widgets. If they edit the same widget from the same revision, the second receives a conflict and must reload.

Complete the web rollout before inviting employees to opt in. Every web replica that can save a layout or copy a widget into a dashboard must run the versioned writer. Staff can then opt in from their account menu. Select **Internal view** under **View mode**, then open **Feature preview** and enable **Dashboard widget authoring** (`dashboardBlockAuthoring`). Staff eligibility uses the account email's exact domain, `@langfuse.com` or `@clickhouse.com`, case-insensitively. Self-hosted installations use the same email-domain convention. The preview defaults off. After enrollment, authoring works in either view on dashboards the employee can edit. Staff can opt out in either view and re-enroll in Internal view. Ordinary readers retain access to the saved widgets. Organization defaults and deployment-wide experimental settings cannot grant widget authoring.

| Project access | Read saved widgets | Edit classic placements | Author Markdown and multi-query widgets |
| --- | --- | --- | --- |
| Opted-in employee with edit permission | Yes | Yes | Yes |
| Other dashboard editor | Yes | Yes, including removing a converted Home card | No |
| Dashboard viewer | Yes | No | No |
| No dashboard access | No | No | No |

The existing dashboard read includes a presence hint so an ordinary classic dashboard can load without a separate request to load inline widgets. A new client pointed at a pre-feature server falls back to the classic dashboard. Older application versions continue to read and save the original grid. Turning the preview off keeps both the document and its contents visible on the upgraded app. A true application rollback restores the pre-feature layout writer. Opening a dashboard on that version preserves the complete document, but saving a classic layout replaces it with `{widgets}` and drops its inline charts and Markdown widgets. Before deploying an older binary, back up the full definitions of pilot dashboards or pause writes to their layouts, including API updates and copying widgets into those dashboards.

An inline widget refers to an existing chart placement or the end of the dashboard. If its anchor disappears, it displays at the end. Upgraded same-project clones include stored inline widgets and revisions are checked on updates. A clone created by a pre-feature server contains only the classic grid. The classic JSON export contains the original grid.

Multi-query schedules up to five ordinary analytics queries for the active tab. Each tab has its own display settings, queries and browser-evaluated formulas. For example, an observation containing both `metadata.abc` and `metadata.bbc` contributes to both independently filtered counts. Compatible presentation changes reuse existing results. Abandoned v4 streams can be aborted. On the legacy transport an already submitted request retains its concurrency slot until it settles.

## Editing a Home card

Hover over a Home card and choose **Edit widget**. The employee editor opens with the card’s queries, current model or score selections, and active tab. Changing the draft or choosing **Cancel** leaves the dashboard alone. **Save chart** replaces only that placement, including when it shares a row with other cards. On managed Home, the pencil opens the clone flow and continues editing that card in the project copy. The first preview uses the time range, filters and data source from the Home card. Temporary Home filters apply only to that preview. Reopening the saved chart uses the copy’s dashboard filters. Creating the copy leaves the project’s Home selection alone.

The saved widget uses the same editor, tabs, formulas and display controls as any multi-query chart. All authorized readers see the replacement. Choose **Widget actions → Restore Home card** to discard the editable configuration and bring back the preset in its current position and size. **Remove widget** deletes both. Duplicating the editable widget creates an independent chart. Restoring a preset brings back its normal reader controls and defaults. Unsaved reader selections on the original card are session state.

| Home card                       | Starting configuration in the editor                                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Traces                          | Top 20 names plus a separately queried total. The newer read path counts distinct trace IDs.                                                                                                                                        |
| Model costs                     | Cost and tokens in adjacent columns, ranked by cost. The subtotal includes unnamed models in the returned top 20.                                                                                                                   |
| Scores                          | Counts and means by score name, source and data type, including counts equal to zero and one. Category counts and the full-period total have their own tabs.                                                                        |
| Traces and observations by time | Observation counts by level and a period total. The legacy read path also includes traces.                                                                                                                                          |
| Model usage                     | Cost and usage by model or category, plus totals for the selected models. On v3, the category tabs use the existing Home queries.                                                                                                   |
| User consumption                | Cost and trace counts by user, with a subtotal of the returned groups.                                                                                                                                                              |
| Scores over time                | Numeric and boolean score means per time bucket, grouped by name, data type and source.                                                                                                                                             |
| Trace latency                   | p50, p90, p95 and p99 by name. The v3 card measures traces. The v4 card measures root observations.                                                                                                                                 |
| Generation latency table        | The same four percentiles by generation-like observation name, ranked by p95.                                                                                                                                                       |
| Observation latency table       | Percentiles by observation type and name, excluding generations.                                                                                                                                                                    |
| Model latencies                 | Five percentile tabs from p50 through p99 for the selected models.                                                                                                                                                                  |
| Score analytics                 | Distribution and trend tabs for each selected numeric, boolean or categorical definition. Choose up to four definitions in one widget. The editor explains how its histogram population differs from the sampled v3 Home histogram. |

The original preset placement remains the geometry owner in the classic projection. A versioned chart entry in the same dashboard document identifies that placement and its preset type. A row lock checks both before saving. Moves and resizes update one grid slot. Authorized reads render the editable chart there. The classic projection still renders the original card for older clients. Upgraded servers reject ambiguous placement IDs and attempts to detach or silently delete a saved conversion through a classic layout write. During a binary rollback, retain the backup and layout-edit precautions above. A server that understands inline widgets but predates conversions can move the original placement. Replacing or removing the original placement on that server breaks the binding.

## Public API and MCP

The unstable dashboards API and its MCP tools expose the same dashboard definition. For a supported dashboard, `version: "1"` and `blocks` describe the chart placements, Markdown and multi-query widgets. Clients can continue reading or writing the deprecated `widgets` projection. Classic placements use the public grid fields `width` and `height` in both arrays.

To move a classic chart using the v1 API, GET the dashboard, update the chart placement in `blocks`, then PATCH the definition with `version` and `blocks`. If you also send `widgets`, keep it equal to the classic placements in `blocks`. Preserve the saved inline widget IDs, configurations, anchors and revisions. An API key may read or echo those widgets during the staff pilot. Standalone inline widgets require an opted-in employee to create, change or remove them. Dashboard editors can still remove a converted Home placement using its widget menu. An API client that echoes outdated widget revisions receives HTTP 409 and can fetch the dashboard again before retrying. Attempts to edit protected widgets through the public API return HTTP 403.

An older `{widgets}` client can save its layout without knowing which inline widgets exist. A reader encountering an unsupported future root receives the classic projection. Its stored definition can be edited by a server that understands that version.

## Evolving a definition

`kind` selects the editor. `config.version` identifies the persisted format for that kind. `revision` counts successful edits to one saved widget and prevents stale writes. A Markdown edit can move revision 6 to 7 while the format stays at version 1. The analytics API read version (`v1`/`v2`) separately selects a data source at query time.

Bump the format when an older editor could discard a saved option or change its meaning. For example, a new percentile label that exists only in the editor UI can reuse the format. Tabbed charts use config version 2. The version 1 reader continues to support the original single-chart and saved-view format. Introduce readers for both formats before turning on a newer writer. Convert one definition at a time on an explicit save, or use a measured migration for a later rollout. Existing classic widgets require no rewrite.

A reader skips an unsupported widget version. An individual update or removal also checks the stored format and edit revision before changing the widget. Same-project clones on upgraded servers copy each config as stored, including formats the running server cannot display. Unversioned pilot Markdown is read as version 1. New Markdown and multi-query writes carry an explicit version.
