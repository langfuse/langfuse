import {
  eventsTableSingleFilterList,
  type FilterState,
} from "@langfuse/shared";
import { z } from "zod";

const FilterStateSchema = eventsTableSingleFilterList.transform(
  (filters): FilterState => filters as FilterState,
);

const MatchSchema = z.object({
  entity: z.enum(["TRACE", "OBSERVATION"]),
  filters: FilterStateSchema.default([]),
});

const PlacementSchema = z.discriminatedUnion("surface", [
  z.object({
    surface: z.literal("TRACE"),
    slot: z.literal("TAB"),
    label: z.string().min(1).max(40),
  }),
  z.object({
    surface: z.literal("SESSION"),
    slot: z.enum(["OBSERVATION_INPUT", "OBSERVATION_OUTPUT"]),
    injection: z.literal("AFTER"),
    anchor: z.object({
      observationType: z.string().max(40).optional(),
      observationName: z.string().max(160).optional(),
      jsonPath: z.string().max(300).optional(),
    }),
  }),
]);

const BindingSchema = z.object({
  source: z.enum([
    "TRACE",
    "TRANSCRIPT",
    "OBSERVATION_INPUT",
    "OBSERVATION_OUTPUT",
  ]),
  jsonPath: z.string().max(300).optional(),
});

const TemplateRendererSchema = z.object({
  kind: z.literal("template"),
  template: z.string().min(1).max(20_000),
  prepareSource: z.string().max(20_000).default("return data;"),
});

const ChartRendererSchema = z.object({
  kind: z.literal("chart"),
  chart: z.enum(["bar", "line", "scatter", "timeline"]),
  dataPath: z.string().max(300).default(""),
  xKey: z.string().min(1).max(120),
  yKey: z.string().min(1).max(120),
  labelKey: z.string().max(120).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const ReactRendererSchema = z.object({
  kind: z.literal("react"),
  source: z.string().min(1).max(40_000),
});

const ShaderRendererSchema = z.object({
  kind: z.literal("shader"),
  fragmentShader: z.string().min(1).max(20_000),
  prepareSource: z.string().max(20_000).default("return {};"),
});

const GeneratedFilterSchema = z.object({
  column: z.string(),
  type: z.string(),
  operator: z.string(),
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.string()),
      z.array(z.number()),
      z.null(),
    ])
    .optional(),
});

const GeneratedPlacementSchema = z.discriminatedUnion("surface", [
  z.object({
    surface: z.literal("TRACE"),
    slot: z.literal("TAB"),
    label: z.string(),
  }),
  z.object({
    surface: z.literal("SESSION"),
    slot: z.enum(["OBSERVATION_INPUT", "OBSERVATION_OUTPUT"]),
    injection: z.literal("AFTER"),
    anchor: z.object({
      observationType: z.string().optional(),
      observationName: z.string().optional(),
      jsonPath: z.string().optional(),
    }),
  }),
]);

const GeneratedRendererSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("template"),
    template: z.string(),
    prepareSource: z.string(),
  }),
  z.object({
    kind: z.literal("chart"),
    chart: z.enum(["bar", "line", "scatter", "timeline"]),
    dataPath: z.string(),
    xKey: z.string(),
    yKey: z.string(),
    labelKey: z.string().optional(),
    color: z.string(),
  }),
  z.object({
    kind: z.literal("react"),
    source: z.string(),
  }),
  z.object({
    kind: z.literal("shader"),
    fragmentShader: z.string(),
    prepareSource: z.string().optional().default("return {};"),
  }),
]);

export const VisualizationDefinitionGenerationSchema = z.object({
  schemaVersion: z.literal("1"),
  catalogVersion: z.literal("visualization-v1"),
  title: z.string(),
  summary: z.string(),
  match: z.object({
    entity: z.enum(["TRACE", "OBSERVATION"]),
    filters: z.array(GeneratedFilterSchema),
  }),
  placement: GeneratedPlacementSchema,
  binding: z.object({
    source: z.enum([
      "TRACE",
      "TRANSCRIPT",
      "OBSERVATION_INPUT",
      "OBSERVATION_OUTPUT",
    ]),
    jsonPath: z.string().optional(),
  }),
  renderer: GeneratedRendererSchema,
  frame: z.object({
    minHeight: z.number().int(),
    preferredHeight: z.number().int(),
    maxHeight: z.number().int(),
  }),
});

export const VisualizationDefinitionSchema = z
  .object({
    schemaVersion: z.literal("1"),
    catalogVersion: z.literal("visualization-v1"),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(500),
    match: MatchSchema,
    placement: PlacementSchema,
    binding: BindingSchema,
    renderer: z.discriminatedUnion("kind", [
      TemplateRendererSchema,
      ChartRendererSchema,
      ReactRendererSchema,
      ShaderRendererSchema,
    ]),
    frame: z
      .object({
        minHeight: z.number().int().min(80).max(800),
        preferredHeight: z.number().int().min(120).max(1200),
        maxHeight: z.number().int().min(160).max(1600),
      })
      .refine(
        ({ minHeight, preferredHeight, maxHeight }) =>
          minHeight <= preferredHeight && preferredHeight <= maxHeight,
        "Frame heights must increase from minimum to maximum",
      ),
  })
  .superRefine((definition, ctx) => {
    if (
      definition.placement.surface === "TRACE" &&
      definition.match.entity !== "TRACE"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["match", "entity"],
        message: "Trace tabs must match traces",
      });
    }
    if (
      definition.placement.surface === "SESSION" &&
      definition.match.entity !== "OBSERVATION"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["match", "entity"],
        message: "Session inserts must match observations",
      });
    }
  });

export type VisualizationDefinition = z.infer<
  typeof VisualizationDefinitionSchema
>;

export type VisualizationDataEnvelope = {
  trace?: Record<string, unknown>;
  observations?: Array<Record<string, unknown>>;
  observation?: Record<string, unknown>;
  transcript?: unknown;
  selectedValue?: unknown;
};

export const TRACE_STARTER: VisualizationDefinition = {
  schemaVersion: "1",
  catalogVersion: "visualization-v1",
  title: "Trace signal map",
  summary:
    "A calm overview of the trace, its observation mix, and the values worth opening next.",
  match: {
    entity: "TRACE",
    filters: [
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ] satisfies FilterState,
  },
  placement: { surface: "TRACE", slot: "TAB", label: "Signal map" },
  binding: { source: "TRACE" },
  renderer: {
    kind: "template",
    prepareSource: `
const observations = viz.array(data.observations, 100);
const errors = observations.filter((item) => item?.level === "ERROR" || viz.present(item?.statusMessage));
const traceOutput = viz.parse(data.trace?.output);
const outcome = viz.first(
  viz.get(traceOutput, "reply"),
  viz.get(traceOutput, "answer"),
  viz.get(traceOutput, "message"),
  viz.get(traceOutput, "summary"),
  viz.get(traceOutput, "result")
);
const skip = new Set(["reply", "answer", "message", "summary", "result", "reasoning", "thinking"]);
const facts = viz.entries(traceOutput, 20)
  .filter(([key, value]) => !skip.has(key) && (typeof value !== "object" || value === null))
  .slice(0, 4)
  .map(([label, value]) => ({ label, value: viz.text(value, "", 180) }));
const slowest = observations
  .map((item) => ({ name: viz.first(item?.name, item?.type, "Observation"), latency: viz.number(item?.latency), level: item?.level }))
  .filter((item) => item.latency !== undefined)
  .sort((left, right) => right.latency - left.latency)
  .slice(0, 5)
  .map((item) => ({ label: item.name, value: item.latency.toFixed(2) + " s" }));
return {
  name: data.trace?.name || "Untitled trace",
  story: viz.present(outcome)
    ? viz.clip(outcome, 360).text
    : errors.length
      ? "The trace contains explicit error evidence."
      : observations.length
        ? "Inspect the most material recorded steps below."
        : "No observations were available for this trace.",
  attention: errors.length ? errors.length + (errors.length === 1 ? " recorded error" : " recorded errors") : "",
  facts,
  slowest,
  evidence: errors.slice(0, 10).map((item) => viz.first(item.statusMessage, item.name, item.type)).join("\\n")
};`,
    template: `<main class="stack">
  <div class="eyebrow">TRACE SIGNAL MAP</div>
  <h1 class="ellipsis" title="{{name}}">{{name}}</h1>
  <p class="sentence">{{story}}</p>
  {{#if attention}}<span class="badge tone-danger">{{attention}}</span>{{/if}}
  <dl class="facts">{{#each facts}}<dt>{{this.label}}</dt><dd>{{this.value}}</dd>{{/each}}</dl>
  {{#if slowest}}<h2>Slow material steps</h2>{{/if}}
  <dl class="facts">{{#each slowest}}<dt class="ellipsis" title="{{this.label}}">{{this.label}}</dt><dd>{{this.value}}</dd>{{/each}}</dl>
  {{#if evidence}}<details class="accordion"><summary>Error evidence</summary><pre>{{evidence}}</pre></details>{{/if}}
</main>`,
  },
  frame: { minHeight: 220, preferredHeight: 360, maxHeight: 640 },
};

export const TOOL_STARTER: VisualizationDefinition = {
  schemaVersion: "1",
  catalogVersion: "visualization-v1",
  title: "Tool result inspector",
  summary:
    "Shows a compact, contextual view immediately after matching tool output in a session.",
  match: {
    entity: "OBSERVATION",
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["TOOL"],
      },
    ],
  },
  placement: {
    surface: "SESSION",
    slot: "OBSERVATION_OUTPUT",
    injection: "AFTER",
    anchor: { observationType: "TOOL" },
  },
  binding: { source: "OBSERVATION_OUTPUT" },
  renderer: {
    kind: "template",
    prepareSource: `
const observation = data.observation || {};
const input = viz.parse(observation.input);
const output = viz.parse(observation.output ?? data.selectedValue);
const action = viz.first(observation.name, "Tool call");
const explicitError = viz.first(
  observation.statusMessage,
  observation.level === "ERROR" ? viz.get(output, "error") : undefined,
  observation.level === "ERROR" ? viz.get(output, "message") : undefined
);
const status = viz.first(viz.get(output, "status"), viz.get(output, "state"));
let story = "Returned a value.";
if (viz.present(explicitError)) story = action + " reported: " + viz.text(explicitError, "", 220);
else if (viz.present(status)) story = action + " returned status “" + viz.text(status, "", 80) + "”.";
else if (typeof output === "string") story = action + " returned: " + viz.clip(viz.stripAnsi(output), 220).text;
else if (Array.isArray(output)) story = action + " returned " + output.length + (output.length === 1 ? " item." : " items.");
else if (output && typeof output === "object") story = action + " returned structured output.";

const skip = new Set(["error", "message", "status", "state", "content", "body", "data", "raw"]);
const facts = viz.entries(output, 20)
  .filter(([key, value]) => !skip.has(key) && (typeof value !== "object" || value === null))
  .slice(0, 4)
  .map(([label, value]) => ({ label, value: viz.text(value, "", 180) }));
const raw = "INPUT\\n" + viz.text(input, "No input recorded", 4000) + "\\n\\nOUTPUT\\n" + viz.text(output, "No output recorded", 4000);
return { action, story, facts, raw, tone: viz.present(explicitError) ? "error" : "result" };
`,
    template: `<main class="stack compact">
  <div class="eyebrow">TOOL · {{tone}}</div>
  <h2 class="ellipsis" title="{{action}}">{{action}}</h2>
  <p class="sentence">{{story}}</p>
  <dl class="facts">{{#each facts}}<dt>{{this.label}}</dt><dd class="ellipsis" title="{{this.value}}">{{this.value}}</dd>{{/each}}</dl>
  <details class="accordion"><summary>Input and raw output</summary><pre>{{raw}}</pre></details>
</main>`,
  },
  frame: { minHeight: 180, preferredHeight: 300, maxHeight: 520 },
};

export const SHADER_STARTER: VisualizationDefinition = {
  ...TRACE_STARTER,
  title: "Trace field",
  summary: "An experimental GPU view of trace activity.",
  placement: { surface: "TRACE", slot: "TAB", label: "Trace field" },
  renderer: {
    kind: "shader",
    prepareSource: `
const observations = viz.array(data.observations, 64);
const values = observations.map((item) => viz.number(item.latency)).filter((value) => value !== undefined);
return {
  headline: data.trace?.name || "Trace activity field",
  description: values.length ? "Each band is driven by a recorded observation latency." : "No latency values were available for this trace.",
  metrics: [{ label: "Observations", value: observations.length }],
  values,
  labels: observations.map((item) => item.name || item.type || "Observation"),
  details: observations.slice(0, 20).map((item) => (item.name || item.type || "Observation") + ": " + (item.latency ?? "no latency")).join("\n")
};`,
    fragmentShader: `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_values[64];
uniform int u_count;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv - .5;
  float signal = u_count > 0 ? clamp(u_values[0], 0.0, 8.0) / 8.0 : 0.25;
  float rings = .5 + .5 * cos((20.0 + signal * 20.0) * length(p) - u_time * .35);
  vec3 a = vec3(.12, .55, .95);
  vec3 b = vec3(.65, .25, .95);
  gl_FragColor = vec4(mix(a, b, rings) * (1.0 - length(p)), 1.0);
}`,
  },
};
