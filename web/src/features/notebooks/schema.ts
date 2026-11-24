import { z } from "zod";
import { MetricsQueryObjectV2 } from "@/src/features/public-api/types/metrics";

export const MAIN_NOTEBOOK_DOCUMENT = "main";
export const MAX_NOTEBOOK_DOCUMENT_BYTES = 512_000;
export const MAX_NOTEBOOK_DOCUMENTS = 50;
export const MAX_NOTEBOOK_BLOCKS = 500;
export const MAX_NOTEBOOK_NESTING = 64;
export const notebookDocumentId = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
export const notebookVersion = z.number().int().min(1).max(2_147_483_647);

export const notebookLayoutKind = z.enum(["default", "inbox", "tabs", "table"]);
export const notebookDocumentWidth = z.enum(["contained", "full"]);
export type NotebookDocumentWidth = z.infer<typeof notebookDocumentWidth>;

export const notebookDocumentLabel = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !value.includes("\0"), "NUL characters are not allowed.");
const propertyDefinition = z.discriminatedUnion("type", [
  z.strictObject({
    id: notebookDocumentId,
    label: notebookDocumentLabel,
    type: z.enum(["text", "number", "checkbox", "date", "url"]),
  }),
  z.strictObject({
    id: notebookDocumentId,
    label: notebookDocumentLabel,
    type: z.enum(["select", "multi-select"]),
    options: z
      .array(
        z.union([
          notebookDocumentLabel,
          z.strictObject({
            value: notebookDocumentLabel,
            color: z
              .enum(["neutral", "danger", "warning", "success", "info"])
              .optional(),
          }),
        ]),
      )
      .min(1)
      .max(50),
  }),
]);
const propertyValues = z.record(
  notebookDocumentId,
  z.union([
    z.string().max(2048),
    z.number(),
    z.boolean(),
    z.array(z.string()).max(50),
  ]),
);
export type NotebookPropertyValues = z.infer<typeof propertyValues>;
const notebookPropertySchema = z.strictObject({
  version: z.literal(1),
  fields: z.array(propertyDefinition).max(20),
  visibleByDefault: z.array(notebookDocumentId).max(20).optional(),
});
export type NotebookPropertySchema = z.infer<typeof notebookPropertySchema>;
const propertyValidators = {
  text: (value) => typeof value === "string",
  number: (value) => typeof value === "number",
  checkbox: (value) => typeof value === "boolean",
  date: (value) => z.iso.date().safeParse(value).success,
  url: (value) => z.url({ protocol: /^https?$/ }).safeParse(value).success,
  select: (value, options) =>
    typeof value === "string" && options.includes(value),
  "multi-select": (value, options) =>
    Array.isArray(value) && value.every((option) => options.includes(option)),
} satisfies Record<
  NotebookPropertySchema["fields"][number]["type"],
  (value: NotebookPropertyValues[string], options: string[]) => boolean
>;

const documentMetadata = z.strictObject({
  title: notebookDocumentLabel.optional(),
  properties: propertyValues.optional(),
});
const layoutDocument = documentMetadata
  .extend({
    documentId: notebookDocumentId,
    label: notebookDocumentLabel.optional(),
  })
  .refine(({ title, label }) => title !== undefined || label !== undefined, {
    message: "A document title is required.",
    path: ["title"],
  });
const layoutDocuments = z.array(layoutDocument).max(MAX_NOTEBOOK_DOCUMENTS);
export const notebookLayoutSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("default"),
      document: documentMetadata.optional(),
      propertySchema: notebookPropertySchema.optional(),
    }),
    z.strictObject({
      kind: z.literal("inbox"),
      documents: layoutDocuments,
      propertySchema: notebookPropertySchema.optional(),
    }),
    z.strictObject({
      kind: z.literal("tabs"),
      documents: layoutDocuments,
      propertySchema: notebookPropertySchema.optional(),
    }),
    z.strictObject({
      kind: z.literal("table"),
      documents: layoutDocuments,
      propertySchema: notebookPropertySchema.optional(),
    }),
  ])
  .refine(
    (layout) =>
      layout.kind === "default" ||
      new Set(layout.documents.map(({ documentId }) => documentId)).size ===
        layout.documents.length,
    { message: "A layout cannot reference a document more than once." },
  )
  .superRefine((layout, ctx) => {
    const definitions = layout.propertySchema?.fields ?? [];
    const fields = new Map(definitions.map((field) => [field.id, field]));
    const visible = layout.propertySchema?.visibleByDefault ?? [];
    if (
      fields.size !== definitions.length ||
      new Set(visible).size !== visible.length ||
      visible.some((id) => !fields.has(id))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["propertySchema"],
        message:
          "Property IDs must be unique and default fields must be defined.",
      });
    }
    const documents =
      layout.kind === "default" ? [layout.document] : layout.documents;
    for (const [index, document] of documents.entries()) {
      for (const [id, value] of Object.entries(document?.properties ?? {})) {
        const field = fields.get(id);
        const valid =
          field &&
          propertyValidators[field.type](
            value,
            "options" in field
              ? field.options.map((option) =>
                  typeof option === "string" ? option : option.value,
                )
              : [],
          );
        if (!valid)
          ctx.addIssue({
            code: "custom",
            path:
              layout.kind === "default"
                ? ["document", "properties", id]
                : ["documents", index, "properties", id],
            message: "Value must match a defined property.",
          });
      }
    }
  });
export type NotebookLayout = z.infer<typeof notebookLayoutSchema>;

const linkAttrs = z.strictObject({
  href: z.string(),
  title: z.string().nullable().optional(),
});
const imageAttrs = z.strictObject({
  src: z.string(),
  alt: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
});

const markSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.enum(["bold", "strong", "em", "code"]) }),
  z.strictObject({ type: z.literal("link"), attrs: linkAttrs }),
]);
export type NotebookTextMark = z.infer<typeof markSchema>;

const inlineNodeSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("text"),
    text: z.string().min(1),
    marks: z.array(markSchema).optional(),
  }),
  z.strictObject({
    type: z.literal("hard_break"),
    marks: z.array(markSchema).optional(),
  }),
  z.strictObject({
    type: z.literal("image"),
    attrs: imageAttrs,
    marks: z.array(markSchema).optional(),
  }),
]);

const paragraphSchema = z.strictObject({
  type: z.literal("paragraph"),
  content: z.array(inlineNodeSchema).optional(),
});
const headingSchema = z.strictObject({
  type: z.literal("heading"),
  attrs: z.strictObject({ level: z.number().int().min(1).max(6) }),
  content: z.array(inlineNodeSchema).optional(),
});
const codeBlockSchema = z.strictObject({
  type: z.literal("code_block"),
  content: z
    .array(z.strictObject({ type: z.literal("text"), text: z.string().min(1) }))
    .optional(),
});
const ruleSchema = z.strictObject({ type: z.literal("horizontal_rule") });

type ListItem = {
  type: "list_item";
  content: [z.infer<typeof paragraphSchema>, ...NotebookTextBlockNode[]];
};
export type NotebookTextBlockNode =
  | z.infer<
      | typeof paragraphSchema
      | typeof headingSchema
      | typeof codeBlockSchema
      | typeof ruleSchema
    >
  | { type: "blockquote"; content: NotebookTextBlockNode[] }
  | { type: "bullet_list"; content: ListItem[] }
  | { type: "ordered_list"; attrs?: { order: number }; content: ListItem[] };
export type NotebookTextNode =
  | NotebookTextBlockNode
  | ListItem
  | z.infer<typeof inlineNodeSchema>;

const notebookTextBlockNodeSchema: z.ZodType<NotebookTextBlockNode> = z.lazy(
  () => {
    const listItemSchema = z.strictObject({
      type: z.literal("list_item"),
      content: z.tuple([paragraphSchema], notebookTextBlockNodeSchema),
    });
    return z.discriminatedUnion("type", [
      paragraphSchema,
      headingSchema,
      codeBlockSchema,
      ruleSchema,
      z.strictObject({
        type: z.literal("blockquote"),
        content: z.array(notebookTextBlockNodeSchema).min(1),
      }),
      z.strictObject({
        type: z.literal("bullet_list"),
        content: z.array(listItemSchema).min(1),
      }),
      z.strictObject({
        type: z.literal("ordered_list"),
        attrs: z
          .strictObject({ order: z.number().int().nonnegative() })
          .optional(),
        content: z.array(listItemSchema).min(1),
      }),
    ]);
  },
);

const emptyProps = z.strictObject({});
const textContent = z.array(notebookTextBlockNodeSchema);
const storedTextBlock = z.strictObject({
  id: notebookDocumentId,
  schema: z.literal("text@1"),
  props: emptyProps,
  content: textContent,
});
const inputTextBlock = storedTextBlock
  .extend({
    id: notebookDocumentId.optional(),
    props: emptyProps.optional(),
    content: textContent.optional(),
    markdown: z.string().optional(),
  })
  .transform(({ markdown, content, ...block }, ctx) => {
    if (markdown !== undefined && content === undefined) {
      return { ...block, source: "markdown" as const, markdown };
    }
    if (content !== undefined && markdown === undefined) {
      return { ...block, source: "content" as const, content };
    }
    ctx.addIssue({
      code: "custom",
      message: "Provide exactly one of Markdown or typed text content.",
    });
    return z.NEVER;
  });

const storedChartBlock = z.strictObject({
  id: notebookDocumentId,
  schema: z.literal("chart@1"),
  props: z
    .strictObject({
      title: z.string().max(250).optional(),
      query: MetricsQueryObjectV2.safeExtend({
        schema: z.literal("metrics@2"),
      }).strict(),
      display: z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.enum(["line", "bar"]) }),
        z.strictObject({
          kind: z.literal("big-number"),
          format: z.discriminatedUnion("style", [
            z.strictObject({ style: z.enum(["decimal", "percent"]) }),
            z.strictObject({
              style: z.literal("currency"),
              currency: z.string().regex(/^[A-Z]{3}$/),
            }),
          ]),
          caption: z.string().max(250).optional(),
        }),
      ]),
    })
    .refine(
      ({ display, query }) =>
        display.kind !== "line" || query.timeDimension !== null,
      {
        message: "Line charts require a query time dimension.",
        path: ["query"],
      },
    )
    .refine(
      ({ display, query }) =>
        display.kind !== "big-number" ||
        (query.metrics.length === 1 &&
          query.dimensions.length === 0 &&
          query.timeDimension === null),
      {
        message:
          "Big numbers require one metric and no dimensions or time buckets.",
        path: ["query"],
      },
    ),
});
const inputChartBlock = storedChartBlock.extend({
  id: notebookDocumentId.optional(),
});

const rowBlock = z.strictObject({
  id: notebookDocumentId,
  schema: z.literal("row@1"),
});
const inputRowBlock = rowBlock.extend({ id: notebookDocumentId.optional() });

export type NotebookBlock =
  | z.infer<typeof storedTextBlock | typeof storedChartBlock>
  | (z.infer<typeof rowBlock> & { props: { children: NotebookBlock[] } });

type NotebookInputBlock =
  | z.infer<typeof inputTextBlock | typeof inputChartBlock>
  | (z.infer<typeof inputRowBlock> & {
      props: { children: NotebookInputBlock[] };
    });

export const storedNotebookBlockSchema: z.ZodType<NotebookBlock> =
  z.discriminatedUnion("schema", [
    storedTextBlock,
    storedChartBlock,
    rowBlock.extend({
      props: z.strictObject({
        get children(): z.ZodType<NotebookBlock[]> {
          return z.array(storedNotebookBlockSchema).max(MAX_NOTEBOOK_BLOCKS);
        },
      }),
    }),
  ]);

export const notebookInputBlockSchema: z.ZodType<NotebookInputBlock> =
  z.discriminatedUnion("schema", [
    inputTextBlock,
    inputChartBlock,
    inputRowBlock.extend({
      props: z.strictObject({
        get children(): z.ZodType<NotebookInputBlock[]> {
          return z.array(notebookInputBlockSchema).max(MAX_NOTEBOOK_BLOCKS);
        },
      }),
    }),
  ]);

// The codec checks depth before parsing patch blocks with notebookInputBlockSchema.
const patchBlock = z.looseObject({ id: notebookDocumentId.optional() });
export const notebookPatchOperationsSchema = z
  .array(
    z.discriminatedUnion("op", [
      z
        .strictObject({
          op: z.literal("insert"),
          block: patchBlock,
          parentId: notebookDocumentId.optional(),
          beforeId: notebookDocumentId.optional(),
          afterId: notebookDocumentId.optional(),
        })
        .refine(
          ({ parentId, beforeId, afterId }) =>
            [parentId, beforeId, afterId].filter(Boolean).length <= 1,
          {
            message:
              "Insert accepts at most one of parentId, beforeId, or afterId.",
          },
        ),
      z
        .strictObject({
          op: z.literal("replace"),
          blockId: notebookDocumentId,
          block: patchBlock,
        })
        .refine(
          ({ blockId, block }) =>
            block.id === undefined || block.id === blockId,
          {
            message: "Replacement must keep the target block ID.",
            path: ["block", "id"],
          },
        ),
      z.strictObject({
        op: z.literal("remove"),
        blockId: notebookDocumentId,
      }),
    ]),
  )
  .min(1)
  .max(MAX_NOTEBOOK_BLOCKS);
