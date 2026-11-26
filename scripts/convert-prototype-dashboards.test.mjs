import assert from "node:assert/strict";
import test from "node:test";
import { planConversion } from "./convert-prototype-dashboards.mjs";

test("replaces a converted preset in place, inserts anchored text and refuses unknown inline formats", () => {
  const preset = {
    type: "preset",
    id: "home",
    presetId: "home-model-costs",
    x: 6,
    y: 3,
    x_size: 6,
    y_size: 4,
  };
  const query = {
    id: "a",
    label: "Cost",
    view: "observations",
    dimensions: [],
    metrics: [{ id: "cost", measure: "totalCost", aggregation: "sum" }],
    filters: [],
  };
  const chart = {
    version: 2,
    title: "Model costs",
    description: "",
    tabs: [
      {
        id: "main",
        label: "Main",
        queries: [query],
        display: { chartType: "NUMBER" },
        formulas: [
          {
            id: "ratio",
            label: "Ratio",
            expression: "a.cost / a.cost",
            format: "percent",
          },
        ],
      },
    ],
  };
  const converted = {
    id: "previous",
    kind: "convertedPreset",
    revision: 4,
    beforePlacementId: null,
    sourcePreset: { placementId: "home", presetId: preset.presetId },
    config: chart,
  };
  const note = {
    id: "text",
    kind: "markdown",
    revision: 1,
    beforePlacementId: "home",
    config: { version: 1, title: "", content: "Compare costs." },
  };
  const tallNeighbor = {
    id: "neighbor",
    type: "widget",
    widgetId: "neighbor-widget",
    x: 0,
    y: 1,
    x_size: 6,
    y_size: 5,
  };
  const dashboard = {
    id: "dashboard",
    definition: {
      version: "1",
      widgets: [preset, tallNeighbor],
      blocks: [preset, tallNeighbor, converted, note],
      extension: { keep: true },
    },
  };
  const original = structuredClone(dashboard);
  const project = "example-project";
  const { created, layouts } = planConversion(project, [dashboard], []);
  assert.deepEqual(dashboard, original);
  assert.equal(created.length, 2);
  assert.deepEqual(created[0].definition.config.tabs, chart.tabs);
  assert.deepEqual(layouts[0].widgets, [
    {
      id: "home",
      type: "widget",
      widgetId: created[0].id,
      x: 6,
      y: 5,
      x_size: 6,
      y_size: 4,
    },
    {
      ...tallNeighbor,
      y: 3,
    },
    {
      id: layouts[0].widgets[2].id,
      type: "widget",
      widgetId: created[1].id,
      x: 0,
      y: 1,
      x_size: 12,
      y_size: 2,
    },
  ]);
  assert.deepEqual(
    planConversion(
      project,
      [
        {
          id: dashboard.id,
          definition: {
            widgets: layouts[0].widgets,
            extension: original.definition.extension,
          },
        },
      ],
      created,
    ),
    { layouts: [], created: [], updates: [] },
  );

  converted.config = { ...chart, version: 3 };
  assert.throws(
    () => planConversion(project, [dashboard], []),
    /Unrecognized prototype widget format/,
  );
  converted.config = chart;
  note.revision = -1;
  assert.throws(
    () => planConversion(project, [dashboard], []),
    /inline widget revision/,
  );
});
