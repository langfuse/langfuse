import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const CUSTOM_UI_CATALOG_VERSION = "custom-ui@1" as const;

const ToneSchema = z.enum(["neutral", "info", "success", "warning", "danger"]);

const MessageSchema = z
  .object({
    role: z.string().max(80),
    content: z.string().max(20_000),
    label: z.string().max(160).nullable(),
  })
  .strict();

const TimelineItemSchema = z
  .object({
    label: z.string().max(500),
    detail: z.string().max(2_000).nullable(),
    time: z.string().max(160).nullable(),
    tone: ToneSchema,
  })
  .strict();

/**
 * The only components an AI-authored Custom UI may use. The catalog is kept
 * versioned and action-free: saved specs are presentation, never executable
 * application code.
 */
export const customUiCatalog = defineCatalog(schema, {
  components: {
    Card: {
      props: z
        .object({
          title: z.string().max(500).nullable(),
          description: z.string().max(2_000).nullable(),
          tone: ToneSchema,
        })
        .strict(),
      slots: ["default"],
      description: "Groups one related part of the story in a card.",
    },
    Stack: {
      props: z.object({ gap: z.enum(["xs", "sm", "md", "lg"]) }).strict(),
      slots: ["default"],
      description: "Stacks related content vertically.",
    },
    Grid: {
      props: z
        .object({ columns: z.union([z.literal(2), z.literal(3)]) })
        .strict(),
      slots: ["default"],
      description: "Lays out compact comparable facts in two or three columns.",
    },
    Heading: {
      props: z
        .object({
          text: z.string().max(1_000),
          level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
        })
        .strict(),
      description: "Introduces a meaningful section of the Custom UI.",
    },
    Text: {
      props: z
        .object({
          content: z.string().max(20_000),
          variant: z.enum(["body", "muted", "mono"]),
          maxLines: z.number().int().min(1).max(20).nullable(),
        })
        .strict(),
      description: "Renders prose, supporting copy, or compact monospace text.",
    },
    Badge: {
      props: z.object({ text: z.string().max(500), tone: ToneSchema }).strict(),
      description: "Shows a short status or category label.",
    },
    Alert: {
      props: z
        .object({
          title: z.string().max(500),
          message: z.string().max(4_000),
          tone: z.enum(["info", "success", "warning", "danger"]),
        })
        .strict(),
      description: "Highlights an important outcome, warning, or failure.",
    },
    Stat: {
      props: z
        .object({
          label: z.string().max(500),
          value: z.union([z.string().max(2_000), z.number(), z.boolean()]),
          detail: z.string().max(2_000).nullable(),
          tone: ToneSchema,
        })
        .strict(),
      description: "Shows one important scalar value with context.",
    },
    Meter: {
      props: z
        .object({
          label: z.string().max(500),
          value: z.number(),
          min: z.number(),
          max: z.number(),
          detail: z.string().max(2_000).nullable(),
        })
        .strict(),
      description: "Shows a bounded numeric measurement such as confidence.",
    },
    KeyValue: {
      props: z
        .object({
          label: z.string().max(500),
          value: z.union([z.string().max(20_000), z.number(), z.boolean()]),
          maxCharacters: z.number().int().min(20).max(500),
        })
        .strict(),
      description: "Shows one labeled value with safe truncation.",
    },
    ListItem: {
      props: z
        .object({
          primary: z.string().max(2_000),
          secondary: z.string().max(4_000).nullable(),
          badge: z.string().max(500).nullable(),
        })
        .strict(),
      description: "Shows a compact item in a semantic list.",
    },
    MessageList: {
      props: z
        .object({
          messages: z.array(MessageSchema).max(100),
          maxVisible: z.number().int().min(1).max(50),
        })
        .strict(),
      description: "Shows a bounded conversation as readable messages.",
    },
    ToolCallSummary: {
      props: z
        .object({
          name: z.string().max(500),
          status: z.string().max(160).nullable(),
          inputSummary: z.string().max(4_000).nullable(),
          outputSummary: z.string().max(4_000).nullable(),
        })
        .strict(),
      description:
        "Turns a tool input and output into a human sentence-like summary.",
    },
    CodePreview: {
      props: z
        .object({
          label: z.string().max(500).nullable(),
          code: z.string().max(40_000),
          language: z.string().max(80).nullable(),
          maxLines: z.number().int().min(1).max(100),
        })
        .strict(),
      description:
        "Shows bounded CLI output or source text without executing it.",
    },
    Json: {
      props: z
        .object({
          label: z.string().max(500).nullable(),
          value: z.unknown(),
          collapsed: z.boolean(),
        })
        .strict(),
      description: "Provides a safe fallback for structured data.",
    },
    Accordion: {
      props: z
        .object({ title: z.string().max(500), defaultOpen: z.boolean() })
        .strict(),
      slots: ["default"],
      description: "Defers secondary detail behind a disclosure control.",
    },
    Timeline: {
      props: z.object({ items: z.array(TimelineItemSchema).max(100) }).strict(),
      description: "Shows a bounded sequence of meaningful events.",
    },
    BarList: {
      props: z
        .object({
          items: z
            .array(
              z
                .object({
                  label: z.string().max(500),
                  value: z.number(),
                })
                .strict(),
            )
            .max(50),
          valueLabel: z.string().max(160).nullable(),
        })
        .strict(),
      description: "Compares a small set of genuine numeric measurements.",
    },
  },
  actions: {},
});

export type CustomUiCatalog = typeof customUiCatalog;
