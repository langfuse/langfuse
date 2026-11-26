# Dashboard widgets

Charts and Markdown are saved widgets. A dashboard stores their placements, including the widget ID, position and size. The Widgets section lists the same saved objects used by dashboards. Editing a widget changes its shared definition everywhere it is placed.

Employees enable **Dashboard widget authoring** in Feature preview. With project edit permission, they use the new editor from both dashboards and the Widgets section. A widget can contain named tabs, several queries per tab, and browser-computed formulas. Add Markdown to explain the charts. All authorized dashboard readers see saved widgets, including readers who have the authoring flag disabled.

## Storage and compatibility

The existing `DashboardWidget` record owns the content. Its nullable `definition` JSON contains either `{ version: 1, kind: "multiQuery", config }` or `{ version: 1, kind: "markdown", config }`. A chart config contains named tabs; each tab owns its queries, display settings and formulas. `revision` increments on definition saves and detects concurrent edits. A widget with no definition uses its existing view, metrics, dimensions, filters, chart type and chart configuration.

The PostgreSQL migration `20261126090000_add_widget_definition` adds `definition` and `revision` to `dashboard_widgets`. Existing rows retain their original content and start with revision zero. The migration requires no data backfill.

The original columns provide a compatibility projection of a rich widget's first query. Applications predating the definition field display that projection. They cannot display the complete tabs, formulas or Markdown. Current servers reject classic updates that would overwrite a rich widget through the old editor or API. Deploy the schema migration before the updated application and deploy the new reader to all web replicas before enabling authoring.

The migration `20261126180000_guard_versioned_widget_updates` also installs a PostgreSQL trigger. Updates to a rich widget's content or compatibility projection must advance its revision. This rejects writes from older binaries, including attempts to clear the definition, while classic widgets and unchanged updates remain writable. Old clients may show a generic save error; the database preserves the saved rich content.

Prefer turning off authoring on the updated application to rolling back its binaries. A rollback can still read the first-query projection, but cannot edit rich widgets. Retain both additive columns and the trigger during rollback. Dropping the columns destroys saved rich content. Widgets whose definition is null continue to use the classic columns.

Dashboards use their existing `widgets` array of placements. Saving a chart creates or updates a widget record. Adding it to a dashboard creates a placement with that widget ID. Replacing a Home card keeps the placement ID and geometry. The chart content is saved on the widget.

Dashboard documents contain placements only. Existing classic widgets remain readable without a JSON definition. All newly authored charts and Markdown use the widget definition above.

## Home card templates

For authors with the feature flag, the Add widget interface offers the Home cards as starting templates. Choosing a template prepares a new editable widget. Editing an existing Home card opens its associated configuration in the same editor. Saving creates a saved widget and replaces that one preset placement atomically. The preset's size and position carry into the saved widget placement.

Managed Home dashboards are copied into the project before editing. The copy becomes the editable destination. Existing preset readers remain available for dashboards that still contain preset placements.

For enabled authors, importing a dashboard containing legacy Home cards is rejected before any writes. Convert those cards before exporting, or add their replacements from Templates. Classic import behavior remains unchanged for authors without the flag.

The available templates cover traces, model costs, scores, observations over time, model usage, user consumption, scores over time, trace latency, generation latency, observation latency, model latencies, and score analytics. Template configuration accounts for the project's read path. Some legacy category and score analytics templates use the existing Home queries to preserve their data semantics.

## Authoring and API contract

`dashboardWidgets.saveDefinition` saves the versioned content with the expected widget revision. It can create a placement or replace an existing placement in the same transaction. The server checks employee eligibility, personal opt-in and project edit permission. Reading saved definitions requires the normal project read scope.

The employee opt-in uses the exact account email domains `@langfuse.com` and `@clickhouse.com`, case-insensitively. Internal view exposes enrollment. The personal flag defaults off. An employee can opt out in either view. Organization defaults and deployment-wide experimental settings cannot grant authoring.

REST and MCP get/list expose saved widget definitions and revisions alongside the classic fields. Project keys can round-trip dashboard placements, preserving their widget references. Public widget POST/PATCH requests carrying a non-null definition return 403 during the employee authoring rollout. Classic PATCH requests targeting a rich widget return 409 rather than overwrite its content. Rich widget content is edited through the opted-in employee interface. MCP `renderWidget` renders saved and ad-hoc definitions using the dashboard chart renderer. It queries only the active tab, computes formulas from returned operands, preserves tab selection on refresh, and renders Markdown without an analytics query. Chat hosts with interactive tool calls can switch tabs directly; other hosts can request another tab by ID.

Direct saved-widget links also render for readers without the authoring flag. MCP source links carry the effective query time range into that page.

## Frontend ownership

The `multi-query/` subtree owns query editing, execution, formulas and chart rendering. `DashboardBlockEditor` hosts the content editor. Dashboard and widget entry points supply saved widget identity and revision, and save through the widget service. Widget rendering is available independently of authoring eligibility.

`DashboardWidgetsGrid` supplies Home-card editing and clone-first behavior around the regular placement grid. There is no inline dashboard content renderer or separate layout mode.

## Local structure inspector

In a development server, choose **Inspect structure** from either the Dashboards or Widgets section. The route is `/project/[projectId]/dashboards/debug`. Select a dashboard to inspect its persisted layout, then select a referenced widget ID to inspect its saved content, original fields and revision. **Refresh stored data** reloads the database values after an edit.

The inspector requires dashboard read access to the selected project and is unavailable when `NODE_ENV` is production or test. Database queries select only dashboard and widget fields, including project-owned and Langfuse-managed definitions. The raw JSON view is excluded from session replay. Each selector shows at most 500 records, and direct `dashboardId` or `widgetId` query parameters can select another authorized record.

## Converting local prototype data

Unreleased prototype formats are not part of the application reader. For a local developer database, run `node --env-file=.env scripts/convert-prototype-dashboards.mjs --project PROJECT` to preview conversion. To apply it, add `--apply --backup /tmp/dashboard-backup.json` with a new backup filename. The script converts only the selected project, preserves existing chart views through the archived prototype converter, and writes an exclusive backup before its transaction changes any rows. Unknown formats or bindings stop conversion. It is not a production migration.
