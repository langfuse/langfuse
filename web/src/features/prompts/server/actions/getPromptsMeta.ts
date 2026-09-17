import {
  type GetPromptsMetaType,
  type FilterState,
  promptsTableCols,
  type PromptType,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { tableColumnsToSqlFilterAndPrefix } from "@langfuse/shared/src/server";

export type GetPromptsMetaParams = GetPromptsMetaType & { projectId: string };

export const getPromptsMeta = async (
  params: GetPromptsMetaParams,
): Promise<PromptsMetaResponse> => {
  const { projectId, page, limit } = params;

  const promptsMeta = (await prisma.$queryRaw`
    WITH page_names AS MATERIALIZED (
      SELECT p.name
      FROM prompts p
      WHERE p."project_id" = ${projectId}
        ${getPromptsFilterCondition(params)}
      GROUP BY p.name
      ORDER BY p.name
      LIMIT ${limit}
      OFFSET ${limit * (page - 1)}
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

  const [{ count: totalItemsCount }] = (await prisma.$queryRaw`
    SELECT COUNT(*) AS count
    FROM (
      SELECT p.name
      FROM prompts p
      WHERE p."project_id" = ${projectId}
      ${getPromptsFilterCondition(params)}
      GROUP BY p.name
    ) names
  `) as { count: BigInt }[];

  const totalItems = Number(totalItemsCount);
  const totalPages = Math.ceil(totalItems / limit);

  return {
    data: promptsMeta,
    meta: { page, limit, totalPages, totalItems },

    // necessary for backwards compatibility as we initially released the /v2/prompts endpoint with this structure which did not match the api spec
    // https://github.com/langfuse/langfuse/issues/2068
    pagination: { page, limit, totalPages, totalItems },
  };
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

const getPromptsFilterCondition = (params: GetPromptsMetaType) => {
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
