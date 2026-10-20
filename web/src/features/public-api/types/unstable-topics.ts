import { z } from "zod";
import { optionalJsonParam, singleFilterList } from "@langfuse/shared";

const pagination = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

const timeWindow = z.object({
  fromTimestamp: z.coerce.date().optional(),
  toTimestamp: z.coerce.date().optional(),
});

const paginationMeta = z.object({
  page: z.number(),
  limit: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
});

const FacetRefSchema = z
  .object({ id: z.string(), name: z.string(), version: z.number().int() })
  .strict();

const WindowSchema = z
  .object({ from: z.coerce.date(), to: z.coerce.date() })
  .strict();

const TopicFacetSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    isBuiltIn: z.boolean(),
    active: z.boolean(),
    version: z.number().int(),
    prompt: z.string(),
    publishedRun: z
      .object({
        id: z.string(),
        completedAt: z.coerce.date().nullable(),
        topicCount: z.number().int(),
      })
      .strict()
      .nullable(),
  })
  .strict();

const TopicSchema = z
  .object({
    id: z.string(),
    versionId: z.string(),
    name: z.string(),
    description: z.string(),
    facet: FacetRefSchema,
    runId: z.string(),
    traceCount: z.number().int(),
  })
  .strict();

const TopicStatusCountsSchema = z
  .object({
    assigned: z.number().int(),
    outlier: z.number().int(),
    awaitingMap: z.number().int(),
    notApplicable: z.number().int(),
    insufficientInput: z.number().int(),
  })
  .strict();

export const GetUnstableTopicFacetsQuery = pagination.extend({
  filter: optionalJsonParam(singleFilterList, "filter"),
});
export const GetUnstableTopicFacetsResponse = z
  .object({ data: z.array(TopicFacetSchema), meta: paginationMeta })
  .strict();

export const TopicFacetIdQuery = z.object({ facetId: z.string() });
/** @alias */
export const GetUnstableTopicFacetResponse = TopicFacetSchema;

const TOPICS_ORDER_BY = [
  "traceCount.desc",
  "traceCount.asc",
  "name.asc",
  "name.desc",
] as const;

export const GetUnstableTopicsQuery = pagination
  .extend(timeWindow.shape)
  .extend({
    filter: optionalJsonParam(singleFilterList, "filter"),
    orderBy: z.enum(TOPICS_ORDER_BY).default("traceCount.desc"),
  });
export const GetUnstableTopicsResponse = z
  .object({
    window: WindowSchema,
    data: z.array(TopicSchema),
    facets: z.array(
      z
        .object({
          facet: FacetRefSchema,
          publishedRunId: z.string().nullable(),
          counts: TopicStatusCountsSchema,
        })
        .strict(),
    ),
    meta: paginationMeta,
  })
  .strict();

export const GetUnstableTopicQuery = timeWindow.extend({
  topicId: z.string(),
});
export const GetUnstableTopicResponse = TopicSchema.extend({
  inCurrentMap: z.boolean(),
  window: WindowSchema,
}).strict();
