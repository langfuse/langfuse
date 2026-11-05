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
    ruleIds: z.array(z.string()),
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
    ruleId: z.string().nullable(),
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
          ruleId: z.string().nullable(),
          publishedRunId: z.string().nullable(),
          counts: TopicStatusCountsSchema,
        })
        .strict(),
    ),
    meta: paginationMeta,
  })
  .strict();

const TopicRuleSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    filter: singleFilterList,
    sampling: z.number(),
    facetIds: z.array(z.string()),
    updatedAt: z.coerce.date(),
  })
  .strict();

export const GetUnstableTopicRulesQuery = pagination.extend({
  filter: optionalJsonParam(singleFilterList, "filter"),
});
export const GetUnstableTopicRulesResponse = z
  .object({ data: z.array(TopicRuleSchema), meta: paginationMeta })
  .strict();

export const TopicRuleIdQuery = z.object({ ruleId: z.string() });
/** @alias */
export const GetUnstableTopicRuleResponse = TopicRuleSchema;

const TopicResultCursor = z.object({
  v: z.literal(1),
  timestamp: z.coerce.date(),
  traceId: z.string(),
  facetId: z.string(),
});

export const encodeTopicResultCursor = (cursor: {
  timestamp: Date;
  traceId: string;
  facetId: string;
}) =>
  Buffer.from(
    JSON.stringify({
      v: 1,
      timestamp: cursor.timestamp.toISOString(),
      traceId: cursor.traceId,
      facetId: cursor.facetId,
    }),
  ).toString("base64url");

const resultListQuery = timeWindow.extend({
  filter: optionalJsonParam(singleFilterList, "filter"),
  orderBy: z
    .enum(["timestamp.desc", "timestamp.asc"])
    .default("timestamp.desc"),
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      try {
        return TopicResultCursor.parse(
          JSON.parse(Buffer.from(value, "base64url").toString("utf-8")),
        );
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid cursor." });
        return z.NEVER;
      }
    }),
});

const resultListMeta = z
  .object({ cursor: z.string().nullable(), comment: z.string().optional() })
  .strict();

export const GetUnstableTopicSummariesQuery = resultListQuery.extend({
  truncateSummaries: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default(false),
});
export const GetUnstableTopicSummariesResponse = z
  .object({
    window: WindowSchema,
    data: z.array(
      z
        .object({
          traceId: z.string(),
          traceName: z.string(),
          environment: z.string(),
          timestamp: z.coerce.date(),
          facetId: z.string(),
          facetName: z.string(),
          facetVersion: z.number().int(),
          state: z.enum(["complete", "not_applicable", "insufficient_input"]),
          summary: z.string().nullable(),
          summaryTruncated: z.boolean(),
          processedAt: z.coerce.date(),
        })
        .strict(),
    ),
    meta: resultListMeta,
  })
  .strict();

export const GetUnstableTopicAssignmentsQuery = resultListQuery;
export const GetUnstableTopicAssignmentsResponse = z
  .object({
    window: WindowSchema,
    data: z.array(
      z
        .object({
          traceId: z.string(),
          timestamp: z.coerce.date(),
          facetId: z.string(),
          facetName: z.string(),
          facetVersion: z.number().int(),
          ruleId: z.string().nullable(),
          status: z.enum(["assigned", "outlier"]),
          topic: z
            .object({ id: z.string(), versionId: z.string(), name: z.string() })
            .strict()
            .nullable(),
          runId: z.string().nullable(),
          assignedAt: z.coerce.date(),
        })
        .strict(),
    ),
    meta: resultListMeta,
  })
  .strict();

export const GetUnstableTopicQuery = timeWindow.extend({
  topicId: z.string(),
});
export const GetUnstableTopicResponse = TopicSchema.extend({
  inCurrentMap: z.boolean(),
  window: WindowSchema,
}).strict();
