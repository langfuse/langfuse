/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  type GetPromptsMetaType,
  type FilterState,
  promptsTableCols,
  type PromptType,
} from "@langfuse/shared";
import { z } from "zod";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import {
  addTagsToCurrentSpan,
  PromptService,
  redis,
  tableColumnsToSqlFilterAndPrefix,
} from "@langfuse/shared/src/server";

export type GetPromptsMetaParams = GetPromptsMetaType & { projectId: string };

type PromptsListFilterParams = Omit<GetPromptsMetaType, "page">;

export const getPromptsMeta = async (
  params: GetPromptsMetaParams,
): Promise<PromptsMetaResponse> => {
  const { projectId, page, limit } = params;

  addTagsToCurrentSpan({
    "langfuse.prompt_list.page": page,
    "langfuse.prompt_list.limit": limit,
    "langfuse.prompt_list.offset": limit * (page - 1),
  });

  const promptsMeta = await queryPromptsMetaPage({
    params,
    limit,
    offset: limit * (page - 1),
  });

  // Page crawls repeat the same full-project count on every page.
  const filterCondition = getPromptsFilterCondition(params);
  let countSource: "cache" | "computed" = "cache";
  const totalItems = await new PromptService(prisma, redis).getPromptListCount({
    projectId,
    filterKey: JSON.stringify([filterCondition.sql, filterCondition.values]),
    computeCount: async () => {
      countSource = "computed";
      const [{ count }] = (await prisma.$queryRaw`
          SELECT COUNT(*) AS count
          FROM (
            SELECT p.name
            FROM prompts p
            WHERE p."project_id" = ${projectId}
            ${filterCondition}
            GROUP BY p.name
          ) names
        `) as { count: BigInt }[];
      return Number(count);
    },
  });
  const totalPages = Math.ceil(totalItems / limit);

  addTagsToCurrentSpan({
    "langfuse.prompt_list.result_count": promptsMeta.length,
    "langfuse.prompt_list.total_items": totalItems,
    "langfuse.prompt_list.count_source": countSource,
  });

  return {
    data: promptsMeta,
    meta: { page, limit, totalPages, totalItems },

    // necessary for backwards compatibility as we initially released the /v2/prompts endpoint with this structure which did not match the api spec
    // https://github.com/langfuse/langfuse/issues/2068
    pagination: { page, limit, totalPages, totalItems },
  };
};

export type GetPromptsMetaCursorParams = PromptsListFilterParams & {
  projectId: string;
  cursor?: PromptsCursorV3;
};

export const getPromptsMetaWithCursor = async (
  params: GetPromptsMetaCursorParams,
): Promise<PromptsMetaCursorResponse> => {
  const { limit, cursor } = params;

  addTagsToCurrentSpan({
    "langfuse.prompt_list.limit": limit,
    "langfuse.prompt_list.has_cursor": cursor !== undefined,
  });

  // Fetch one extra row to know whether a next page exists.
  const rows = await queryPromptsMetaPage({
    params,
    limit: limit + 1,
    offset: 0,
    afterName: cursor?.lastName,
  });
  const data = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit
      ? encodePromptsCursorV3({ lastName: data[data.length - 1].name })
      : undefined;

  addTagsToCurrentSpan({
    "langfuse.prompt_list.result_count": data.length,
  });

  return {
    data,
    meta: { limit, ...(nextCursor ? { cursor: nextCursor } : {}) },
  };
};

// Postgres rejects NUL in text parameters, so such a cursor can never match a stored name.
const PromptsCursorV3 = z.object({
  lastName: z.string().refine((s) => !s.includes("\u0000"), {
    message: "Invalid cursor format",
  }),
});
type PromptsCursorV3 = z.infer<typeof PromptsCursorV3>;

export const EncodedPromptsCursorV3 = z
  .string()
  .transform((val, ctx) => {
    try {
      return JSON.parse(Buffer.from(val, "base64url").toString("utf-8"));
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid cursor format" });
      return z.NEVER;
    }
  })
  .pipe(PromptsCursorV3);

const encodePromptsCursorV3 = (cursor: PromptsCursorV3): string =>
  Buffer.from(JSON.stringify(cursor)).toString("base64url");

const queryPromptsMetaPage = async ({
  params,
  limit,
  offset,
  afterName,
}: {
  params: PromptsListFilterParams & { projectId: string };
  limit: number;
  offset: number;
  afterName?: string;
}): Promise<PromptsMeta[]> => {
  const { projectId } = params;
  return (await prisma.$queryRaw`
    WITH page_names AS MATERIALIZED (
      SELECT p.name
      FROM prompts p
      WHERE p."project_id" = ${projectId}
        ${getPromptsFilterCondition(params)}
        ${afterName !== undefined ? Prisma.sql`AND p.name > ${afterName}` : Prisma.empty}
      GROUP BY p.name
      ORDER BY p.name
      LIMIT ${limit}
      OFFSET ${offset}
    )
    SELECT
      n.name,
      metadata.tags,
      metadata."lastUpdatedAt",
      metadata.versions,
      metadata.labels,
      latest.type AS type,
      latest.config AS "lastConfig"
    FROM page_names n
    CROSS JOIN LATERAL (
      SELECT
        MAX(p.tags) AS tags,
        MAX(p.updated_at) AS "lastUpdatedAt",
        array_agg(DISTINCT p.version) AS versions,
        COALESCE(
          array_agg(DISTINCT label) FILTER (WHERE label IS NOT NULL),
          '{}'::text[]
        ) AS labels
      FROM prompts p
      LEFT JOIN LATERAL unnest(p.labels) AS label ON true
      WHERE p."project_id" = ${projectId}
        AND p.name = n.name
        ${getPromptsFilterCondition(params)}
    ) metadata
    LEFT JOIN LATERAL (
      SELECT p.config, p.type
      FROM prompts p
      WHERE p."project_id" = ${projectId}
        AND p.name = n.name
        ${getPromptsFilterCondition(params)}
      ORDER BY p.version DESC
      LIMIT 1
    ) latest ON true
    ORDER BY n.name
  `) as PromptsMeta[];
};

type PromptsMeta = {
  name: string;
  versions: number[];
  labels: string[];
  tags: string[];
  lastUpdatedAt: Date;
  type: PromptType;
  lastConfig: unknown; // json object
};

export type PromptsMetaResponse = {
  data: PromptsMeta[];
  meta: {
    page: number;
    limit: number;
    totalPages: number;
    totalItems: number;
  };
  // necessary for backwards compatibility as we initially released the /v2/prompts endpoint with this structure which did not match the api spec
  // https://github.com/langfuse/langfuse/issues/2068
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalItems: number;
  };
};

export type PromptsMetaCursorResponse = {
  data: PromptsMeta[];
  meta: {
    limit: number;
    cursor?: string;
  };
};

const getPromptsFilterCondition = (params: PromptsListFilterParams) => {
  if (params.filter !== undefined) {
    return tableColumnsToSqlFilterAndPrefix(
      params.filter,
      promptsTableCols,
      "prompts",
    );
  }

  const { name, version, label, tag, fromUpdatedAt, toUpdatedAt } = params;
  const filters: FilterState = [];

  if (name) {
    filters.push({
      column: "name",
      type: "string",
      operator: "=",
      value: name,
    });
  }

  if (version) {
    filters.push({
      column: "version",
      type: "number",
      operator: "=",
      value: version,
    });
  }

  if (label) {
    filters.push({
      column: "labels",
      type: "arrayOptions",
      operator: "any of",
      value: [label],
    });
  }

  if (tag) {
    filters.push({
      column: "tags",
      type: "arrayOptions",
      operator: "any of",
      value: [tag],
    });
  }

  if (fromUpdatedAt) {
    filters.push({
      column: "updatedAt",
      type: "datetime",
      operator: ">=",
      value: new Date(fromUpdatedAt),
    });
  }

  if (toUpdatedAt) {
    filters.push({
      column: "updatedAt",
      type: "datetime",
      operator: "<",
      value: new Date(toUpdatedAt),
    });
  }

  return tableColumnsToSqlFilterAndPrefix(filters, promptsTableCols, "prompts");
};
