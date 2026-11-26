/**
 * Local developer databases only. Run from a checkout with packages/shared built.
 *
 *   node --env-file=.env scripts/convert-prototype-dashboards.mjs --project PROJECT
 *   node --env-file=.env scripts/convert-prototype-dashboards.mjs --project PROJECT --apply --backup /tmp/dashboard-backup.json
 *
 * Named views use their original converter from Git history to preserve default
 * views, query ranking and mixed-unit panels. In a shallow clone, first fetch
 * the pinned revision below from the Langfuse repository.
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { open } from "node:fs/promises";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";

const requireShared = createRequire(
  new URL("../packages/shared/package.json", import.meta.url),
);
const { ChartConfigSchema } = requireShared("@langfuse/shared");
const {
  DashboardDefinitionSchema,
  widgetDefinitionSchema,
  getWidgetQueryView,
} = requireShared("@langfuse/shared/dashboards");
const { getWidgetRequiredVersion, persistedWidgetViewToQueryView } =
  requireShared("@langfuse/shared/query");
const pocRevision = "1491e78dced2ab65ffcdb477f2a93d0ebd7e647f";

function oldNormalizer() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const temp = mkdtempSync(join(tmpdir(), "langfuse-prototype-chart-"));
  try {
    const archive = join(temp, "source.tar");
    execFileSync("git", [
      "-C",
      root,
      "archive",
      "--output",
      archive,
      pocRevision,
      "packages/shared/src",
    ]);
    execFileSync("tar", ["-xf", archive, "-C", temp]);
    const shared = join(temp, "packages/shared");
    symlinkSync(
      join(root, "packages/shared/node_modules"),
      join(shared, "node_modules"),
      "dir",
    );
    const model = requireShared("tsx/cjs/api").require(
      join(shared, "src/features/dashboards/multiQuery.ts"),
      import.meta.url,
    );
    return (config) => {
      model.multiQueryConfigSchema.parse(config);
      return model.normalizeMultiQueryConfig(config);
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function assertKeys(value, keys, subject) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new Error(
      `Unrecognized ${subject} fields. Inspect the source before converting it.`,
    );
  }
}

function convertWidget(raw, getNormalizer) {
  if (raw.version !== undefined) {
    widgetDefinitionSchema.parse(raw);
    return raw;
  }
  const { version, ...content } = raw.config;
  let config;
  if (raw.kind === "markdown" && (version === 1 || version === undefined)) {
    config = content;
  } else if (raw.kind === "multiQuery" && (version === 1 || version === 2)) {
    let tabbed = content;
    if (version === 1) {
      assertKeys(
        raw.config,
        [
          "title",
          "description",
          "queries",
          "display",
          "views",
          "version",
          "defaultViewId",
        ],
        "named-views chart",
      );
      for (const view of raw.config.views ?? [])
        assertKeys(view, ["id", "label", "queryIds"], "named view");
      const { version: _version, ...normalized } = getNormalizer()(raw.config);
      tabbed = normalized;
    }
    config = {
      ...tabbed,
      tabs: tabbed.tabs.map((tab) => ({
        ...tab,
        queries: tab.queries.map(
          ({ homeScoreAggregate, homeCategoryFallback, ...query }) => {
            if (
              (homeScoreAggregate != null &&
                typeof homeScoreAggregate !== "boolean") ||
              (homeCategoryFallback != null &&
                typeof homeCategoryFallback !== "boolean") ||
              (homeScoreAggregate &&
                (homeCategoryFallback || query.view !== "scores-numeric")) ||
              (homeCategoryFallback &&
                (query.view !== "observations" ||
                  !query.metrics.some(
                    (m) =>
                      m.aggregation === "sum" &&
                      ["costByType", "usageByType"].includes(m.measure),
                  )))
            )
              throw new Error("Unrecognized Home query.");
            return homeScoreAggregate ? { ...query, view: "scores" } : query;
          },
        ),
      })),
    };
  } else {
    throw new Error(
      `Unrecognized prototype widget format: ${raw.kind}, config version ${version}.`,
    );
  }
  const next = { ...raw, version: 1, config };
  widgetDefinitionSchema.parse(next);
  return next;
}

function inlineWidget(projectId, definition) {
  const { config } = definition;
  const common = {
    id: randomUUID(),
    projectId,
    definition,
    revision: 1,
    name:
      definition.kind === "markdown" ? config.title || "Text" : config.title,
  };
  if (definition.kind === "markdown") {
    return {
      ...common,
      description: "",
      view: "OBSERVATIONS",
      dimensions: [],
      metrics: [],
      filters: [],
      chartType: "NUMBER",
      chartConfig: { type: "NUMBER" },
      minVersion: 1,
    };
  }
  const {
    queries: [first],
    display,
  } = config.tabs[0];
  const metricsView = getWidgetQueryView(first.view);
  const view = Object.keys(persistedWidgetViewToQueryView).find(
    (key) => persistedWidgetViewToQueryView[key] === metricsView,
  );
  const minVersion = Math.max(
    ...config.tabs.flatMap((tab) =>
      tab.queries.map((q) =>
        getWidgetRequiredVersion({
          view: getWidgetQueryView(q.view),
          dimensions: q.dimensions,
          measures: q.metrics,
          filters: q.filters,
        }),
      ),
    ),
  );
  return {
    ...common,
    description: config.description,
    view,
    metrics: first.metrics.map((m) => ({
      measure: m.measure,
      agg: m.aggregation,
    })),
    dimensions: first.dimensions,
    filters: first.filters,
    chartType: display.chartType,
    chartConfig: ChartConfigSchema.parse({
      type: display.chartType,
      row_limit: display.rowLimit,
      bins: display.bins,
      defaultSort: display.defaultSort,
      show_value_labels: display.showValueLabels,
    }),
    minVersion,
  };
}

/** Build the entire project change before writing a backup or modifying the database. */
export function planConversion(projectId, dashboards, widgets) {
  let normalizer;
  const normalize = () => (normalizer ??= oldNormalizer());
  const layouts = [];
  const created = [];
  const updates = [];
  for (const widget of widgets) {
    if (widget.definition === null) continue;
    const updated = convertWidget(widget.definition, normalize);
    if (updated !== widget.definition)
      updates.push({
        id: widget.id,
        definition: updated,
        revision: widget.revision,
      });
  }
  for (const dashboard of dashboards) {
    const raw = dashboard.definition;
    DashboardDefinitionSchema.parse(raw);
    if (!("version" in raw) && !("blocks" in raw)) continue;
    if (raw.version !== "1" || !Array.isArray(raw.blocks))
      throw new Error(`Unrecognized layout in ${dashboard.id}.`);
    if (
      !isDeepStrictEqual(
        raw.widgets,
        raw.blocks.filter((item) => !("kind" in item)),
      )
    )
      throw new Error(`Classic placements disagree in ${dashboard.id}.`);
    if (new Set(raw.blocks.map((item) => item.id)).size !== raw.blocks.length)
      throw new Error(`Duplicate placement or inline ID in ${dashboard.id}.`);
    const placements = raw.widgets.map((p) => ({ ...p }));
    for (const block of raw.blocks.filter((item) => "kind" in item)) {
      const converted = block.kind === "convertedPreset";
      assertKeys(
        block,
        [
          "id",
          "kind",
          "revision",
          "beforePlacementId",
          "config",
          ...(converted ? ["sourcePreset"] : []),
        ],
        "inline widget",
      );
      if (!Number.isInteger(block.revision) || block.revision < 1)
        throw new Error(`Invalid inline widget revision in ${dashboard.id}.`);
      if (
        typeof block.id !== "string" ||
        !block.id ||
        (block.beforePlacementId != null &&
          typeof block.beforePlacementId !== "string") ||
        (converted && block.beforePlacementId != null)
      )
        throw new Error(`Invalid inline widget placement in ${dashboard.id}.`);
      if (converted)
        assertKeys(
          block.sourcePreset,
          ["placementId", "presetId"],
          "preset binding",
        );
      const definition = convertWidget(
        { kind: converted ? "multiQuery" : block.kind, config: block.config },
        normalize,
      );
      const widget = inlineWidget(projectId, definition);
      created.push(widget);
      if (converted) {
        const placement = placements.find(
          (p) => p.id === block.sourcePreset.placementId,
        );
        if (
          placement?.type !== "preset" ||
          placement.presetId !== block.sourcePreset.presetId
        )
          throw new Error(`Preset binding changed in ${dashboard.id}.`);
        delete placement.presetId;
        Object.assign(placement, { type: "widget", widgetId: widget.id });
      } else {
        const before = placements.find((p) => p.id === block.beforePlacementId);
        if (block.beforePlacementId != null && !before)
          throw new Error(`Unknown placement anchor in ${dashboard.id}.`);
        let y =
          before?.y ??
          placements.reduce((end, p) => Math.max(end, p.y + p.y_size), 0);
        const height = definition.kind === "markdown" ? 2 : 5;
        if (before) {
          // Full-width blocks precede the entire vertically connected row.
          for (const tile of [...placements].sort((a, b) => b.y - a.y)) {
            if (tile.y < y && tile.y + tile.y_size > y) y = tile.y;
          }
          for (const tile of placements) if (tile.y >= y) tile.y += height;
        }
        placements.push({
          type: "widget",
          id: randomUUID(),
          widgetId: widget.id,
          x: 0,
          y,
          x_size: 12,
          y_size: height,
        });
      }
    }
    layouts.push({ id: dashboard.id, widgets: placements });
  }
  return { layouts, created, updates };
}

async function run() {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      apply: { type: "boolean" },
      backup: { type: "string" },
    },
  });
  if (!values.project || (values.apply && !values.backup))
    throw new Error(
      "Pass --project PROJECT. To write, add --apply --backup NEW_FILE.",
    );
  const projectId = values.project;
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(process.env.DATABASE_URL).hostname,
    )
  )
    throw new Error("Use a local developer database.");
  const { PrismaClient } = requireShared("@prisma/client");
  const db = new PrismaClient();
  try {
    const summary = await db.$transaction(
      async (tx) => {
        await tx.project.findUniqueOrThrow({
          where: { id: projectId },
          select: { id: true },
        });
        const dashboards =
          await tx.$queryRaw`SELECT to_jsonb(d)::text AS raw FROM dashboards d WHERE project_id = ${projectId} ORDER BY id`;
        const widgets =
          await tx.$queryRaw`SELECT to_jsonb(w)::text AS raw FROM dashboard_widgets w WHERE project_id = ${projectId} ORDER BY id`;
        const parsed = (rows) => rows.map(({ raw }) => JSON.parse(raw));
        const dashboardRows = parsed(dashboards),
          widgetRows = parsed(widgets);
        const plan = planConversion(projectId, dashboardRows, widgetRows);
        const summary = {
          projectId,
          mode: values.apply ? "apply" : "dry run",
          dashboards: plan.layouts.length,
          createdWidgets: plan.created.length,
          upgradedWidgets: plan.updates.length,
        };
        if (!(plan.layouts.length || plan.updates.length)) return summary;
        // PostgreSQL numeric JSON values can exceed JavaScript's precision. Refuse a lossy conversion.
        for (const [changes, rows, backupRows] of [
          [plan.layouts, dashboardRows, dashboards],
          [plan.updates, widgetRows, widgets],
        ]) {
          const touched = new Set(changes.map(({ id }) => id));
          for (const [index, row] of rows.entries()) {
            if (!touched.has(row.id)) continue;
            const [{ lossless }] =
              await tx.$queryRaw`SELECT ${backupRows[index].raw}::jsonb = ${JSON.stringify(row)}::jsonb AS lossless`;
            if (!lossless)
              throw new Error(
                `Numeric precision would be lost in ${row.id}. No rows were converted.`,
              );
          }
        }
        if (!values.apply) return summary;
        const backup = await open(values.backup, "wx", 0o600);
        try {
          await backup.writeFile(
            `{"projectId":${JSON.stringify(projectId)},"dashboards":[${dashboards.map((r) => r.raw).join(",")}],"dashboardWidgets":[${widgets.map((r) => r.raw).join(",")}]}`,
          );
          await backup.sync();
        } finally {
          await backup.close();
        }
        if (plan.created.length)
          await tx.dashboardWidget.createMany({ data: plan.created });
        for (const { id, revision, definition } of plan.updates)
          await tx.dashboardWidget.update({
            where: { id, projectId, revision },
            data: { definition, revision: { increment: 1 } },
          });
        for (const layout of plan.layouts)
          await tx.$executeRaw`UPDATE dashboards SET definition = (definition - 'version' - 'blocks') || jsonb_build_object('widgets', ${JSON.stringify(layout.widgets)}::jsonb), updated_at = now() WHERE project_id = ${projectId} AND id = ${layout.id}`;
        return summary;
      },
      { isolationLevel: "Serializable", timeout: 60_000 },
    );
    console.log(JSON.stringify(summary));
  } finally {
    await db.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
