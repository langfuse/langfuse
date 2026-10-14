import {
  eventsTableSingleFilterList,
  type FilterState,
} from "@langfuse/shared";
import { z } from "zod";
import { CUSTOM_UI_CATALOG_VERSION } from "./runtime/catalogDefinition";
import {
  CustomUiSpecSchema,
  type CustomUiRenderInput,
  type CustomUiSpec,
  validateCustomUiSpec,
} from "./runtime/spec";

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
  source: z.enum(["TRACE", "OBSERVATION_INPUT", "OBSERVATION_OUTPUT"]),
  jsonPath: z.string().max(300).optional(),
});

const ValidatedCustomUiSpecSchema = CustomUiSpecSchema.superRefine(
  (spec, ctx) => {
    const result = validateCustomUiSpec(spec);
    if (!result.success) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid Custom UI specification: ${result.code}`,
      });
    }
  },
);

/**
 * The model authors only this action-free, declarative catalog specification.
 * Placement, matching, binding, and version metadata remain application-owned.
 */
export const VisualizationDefinitionGenerationSchema =
  ValidatedCustomUiSpecSchema;

export const VisualizationDefinitionSchema = z
  .object({
    schemaVersion: z.literal("2"),
    catalogVersion: z.literal(CUSTOM_UI_CATALOG_VERSION),
    envelopeVersion: z.literal("1"),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(500),
    match: MatchSchema,
    placement: PlacementSchema,
    binding: BindingSchema,
    spec: ValidatedCustomUiSpecSchema,
  })
  .strict()
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

export type VisualizationDataEnvelope = CustomUiRenderInput;

const traceStarterSpec = {
  root: "root",
  elements: {
    root: {
      type: "Stack",
      props: { gap: "md" },
      children: ["heading", "overview", "details"],
    },
    heading: {
      type: "Heading",
      props: {
        text: {
          $cond: { $state: "/data/trace/name" },
          $then: { $state: "/data/trace/name" },
          $else: "Trace overview",
        },
        level: 2,
      },
      children: [],
    },
    overview: {
      type: "Grid",
      props: { columns: 2 },
      children: ["observationCount", "scoreCount"],
    },
    observationCount: {
      type: "Stat",
      props: {
        label: "Recorded steps",
        value: {
          $computed: "count",
          args: { value: { $state: "/data/observations" } },
        },
        detail: null,
        tone: "neutral",
      },
      children: [],
    },
    scoreCount: {
      type: "Stat",
      props: {
        label: "Scores",
        value: {
          $computed: "count",
          args: { value: { $state: "/scores" } },
        },
        detail: null,
        tone: "neutral",
      },
      children: [],
    },
    details: {
      type: "Accordion",
      props: { title: "Trace data", defaultOpen: false },
      children: ["traceJson"],
    },
    traceJson: {
      type: "Json",
      props: {
        label: null,
        value: { $state: "/data/trace" },
        collapsed: false,
      },
      children: [],
    },
  },
} satisfies CustomUiSpec;

const toolStarterSpec = {
  root: "root",
  elements: {
    root: {
      type: "Stack",
      props: { gap: "md" },
      children: ["heading", "output", "inputDisclosure"],
    },
    heading: {
      type: "Heading",
      props: {
        text: {
          $cond: { $state: "/data/observation/name" },
          $then: { $state: "/data/observation/name" },
          $else: "Tool result",
        },
        level: 3,
      },
      children: [],
    },
    output: {
      type: "Json",
      props: {
        label: "Result",
        value: { $state: "/data/selectedValue" },
        collapsed: false,
      },
      children: [],
    },
    inputDisclosure: {
      type: "Accordion",
      props: { title: "Tool input", defaultOpen: false },
      children: ["input"],
    },
    input: {
      type: "Json",
      props: {
        label: null,
        value: { $state: "/data/observation/input" },
        collapsed: false,
      },
      children: [],
    },
  },
} satisfies CustomUiSpec;

export const TRACE_STARTER: VisualizationDefinition =
  VisualizationDefinitionSchema.parse({
    schemaVersion: "2",
    catalogVersion: CUSTOM_UI_CATALOG_VERSION,
    envelopeVersion: "1",
    title: "Trace overview",
    summary:
      "Highlights the trace shape and keeps the full trace data available on demand.",
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
    placement: { surface: "TRACE", slot: "TAB", label: "Custom UI" },
    binding: { source: "TRACE" },
    spec: traceStarterSpec,
  });

export const TOOL_STARTER: VisualizationDefinition =
  VisualizationDefinitionSchema.parse({
    schemaVersion: "2",
    catalogVersion: CUSTOM_UI_CATALOG_VERSION,
    envelopeVersion: "1",
    title: "Tool result",
    summary:
      "Shows the result first and keeps the matching tool input available on demand.",
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
    spec: toolStarterSpec,
  });

export { CUSTOM_UI_CATALOG_VERSION };
