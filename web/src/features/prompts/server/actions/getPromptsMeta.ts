import { type GetPromptsMetaType } from "@/src/features/prompts/server/utils/validation";
import { promptsTableCols } from "@/src/server/api/definitions/promptsTable";
import {
  tableColumnsToSqlFilterAndPrefix,
  type FilterState,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

export type GetPromptsMetaParams = GetPromptsMetaType & { projectId: string };

export const getPromptsMeta = async (
  params: GetPromptsMetaParams,
): Promise<PromptsMetaResponse> => {
  const { projectId, page, limit } = params;

  const promptsMeta = (await prisma.$queryRaw`
    SELECT
        p.name AS name,
        p.tags AS tags,
        array_agg(DISTINCT p.version) AS versions,
        COALESCE(array_agg(DISTINCT label) FILTER (WHERE label IS NOT NULL), '{}'::text[]) AS labels --- COALESCE is necessary to return an empty array if there are no labels and remove NULLs
    FROM
        prompts p
    LEFT JOIN LATERAL unnest(p.labels) AS label ON true
    WHERE 
        p."project_id" = ${projectId} 
        ${getPromptsFilterCondition(params)}
    GROUP BY
        p.name, p.tags --- tags are the same for all versions of a prompt
    ORDER BY
        p.name --- necessary for consistent pagination
    LIMIT
        ${limit}
    OFFSET
        ${limit * (page - 1)}
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
  const { name, version, label, tag } = params;
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

  return tableColumnsToSqlFilterAndPrefix(filters, promptsTableCols, "prompts");
};
