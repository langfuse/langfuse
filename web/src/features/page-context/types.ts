import { z } from "zod";

export const PAGE_CONTEXT_KINDS = [
  "trace",
  "observation",
  "session",
  "prompt",
  "dataset",
  "experiment-run",
  "page",
] as const;

export type PageContextKind = (typeof PAGE_CONTEXT_KINDS)[number];

/** Bounds keep one snapshot well inside the assistant's per-item context budget. */
export const PAGE_CONTEXT_LIMITS = {
  title: 160,
  id: 200,
  path: 500,
  factKey: 40,
  factLabel: 40,
  factDisplay: 80,
  factValue: 200,
  facts: 8,
  related: 5,
  relatedReason: 40,
  serializedLength: 4_000,
} as const;

const PageContextFactSchema = z.object({
  key: z.string().min(1).max(PAGE_CONTEXT_LIMITS.factKey),
  label: z.string().min(1).max(PAGE_CONTEXT_LIMITS.factLabel),
  display: z.string().max(PAGE_CONTEXT_LIMITS.factDisplay),
  value: z
    .union([z.number(), z.string().max(PAGE_CONTEXT_LIMITS.factValue)])
    .optional(),
});

export type PageContextFact = z.infer<typeof PageContextFactSchema>;

const PageContextEntitySchema = z.object({
  kind: z.enum(PAGE_CONTEXT_KINDS),
  /** Human label for the kind, e.g. "Generation" for an observation. */
  label: z.string().min(1).max(PAGE_CONTEXT_LIMITS.factLabel),
  id: z.string().max(PAGE_CONTEXT_LIMITS.id).optional(),
  title: z.string().max(PAGE_CONTEXT_LIMITS.title),
  facts: z.array(PageContextFactSchema).max(PAGE_CONTEXT_LIMITS.facts),
});

export type PageContextEntity = z.infer<typeof PageContextEntitySchema>;

const PageContextRelatedEntitySchema = PageContextEntitySchema.extend({
  reason: z.string().max(PAGE_CONTEXT_LIMITS.relatedReason),
});

export type PageContextRelatedEntity = z.infer<
  typeof PageContextRelatedEntitySchema
>;

export const PAGE_CONTEXT_SURFACES = ["page", "peek"] as const;

export type PageContextSurface = (typeof PAGE_CONTEXT_SURFACES)[number];

/**
 * What a page shows, as structured data: the entity on screen, the part of it
 * the user has selected, and a few notable related entities. This is the
 * context the assistant receives, so it is deliberately small and bounded.
 */
export const PageContextSnapshotSchema = PageContextEntitySchema.extend({
  version: z.literal(1),
  surface: z.enum(PAGE_CONTEXT_SURFACES),
  path: z.string().max(PAGE_CONTEXT_LIMITS.path),
  focus: PageContextEntitySchema.optional(),
  related: z
    .array(PageContextRelatedEntitySchema)
    .max(PAGE_CONTEXT_LIMITS.related)
    .optional(),
});

export type PageContextSnapshot = z.infer<typeof PageContextSnapshotSchema>;

/** A snapshot frozen at the moment the user handed the page to the assistant. */
export type CapturedPageContext = PageContextSnapshot & {
  capturedAt: string;
};
