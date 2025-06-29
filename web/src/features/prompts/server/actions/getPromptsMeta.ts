import {
  type GetPromptsMetaType,
  type FilterState,
  promptsTableCols,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { tableColumnsToSqlFilterAndPrefix } from "@langfuse/shared/src/server";

export type GetPromptsMetaParams = GetPromptsMetaType & { projectId: string };

export const getPromptsMeta = async (
  params: GetPromptsMetaParams,
): Promise<PromptsMetaResponse> => {
  const { projectId, page, limit } = params;

  const promptsMeta = (await prisma.$queryRaw`
    WITH latest_version_config AS (
      SELECT
          p.name,
          p.config
      FROM
          prompts p
      WHERE
          (p.name, p.version) IN (
              SELECT
                  p.name,
                  MAX(p.version)
              FROM
                  prompts p -- needs to be p for filter conditions
              WHERE
                  p."project_id" = ${projectId}
                  ${getPromptsFilterCondition(params)}
              GROUP BY
                  p.name
        )
      AND p."project_id" = ${projectId}
    ), versions AS (
      SELECT
        p.name AS name,
        MAX(p.tags) AS tags,  -- use max to get tags, they are the same for all versions of a prompt
        MAX(p.updated_at) as "lastUpdatedAt",
        array_agg(DISTINCT p.version) AS versions,
        COALESCE(array_agg(DISTINCT label) FILTER (WHERE label IS NOT NULL), '{}'::text[]) AS labels --- COALESCE is necessary to return an empty array if there are no labels and remove NULLs
      FROM
          prompts p -- needs to be p for filter conditions
      LEFT JOIN LATERAL unnest(p.labels) AS label ON true
      WHERE 
          p."project_id" = ${projectId} 
          ${getPromptsFilterCondition(params)}
      GROUP BY
          p.name
      ORDER BY
          p.name --- necessary for consistent pagination
      LIMIT
          ${limit}
      OFFSET
          ${limit * (page - 1)}
    )

    SELECT
      v.*,
      l.config AS "lastConfig"
    FROM
      versions v
    LEFT JOIN latest_version_config l ON v.name = l.name
  `) as PromptsMeta[];

  const [{ count: totalItemsCount }] = (await prisma.$queryRaw`
    SELECT COUNT(DISTINCT p.name) AS count
    FROM prompts p
    WHERE "project_id" = ${projectId} 
    ${getPromptsFilterCondition(params)}
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
