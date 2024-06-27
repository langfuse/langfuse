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

  const promptsData = await prisma.$queryRaw<
    {
      name: string;
      latest_version: number;
      latest_version_created_at: Date;
      number_of_generations: number;
    }[]
  >`
      SELECT 
          p.name,
          MAX(p.version) AS latest_version,
          MAX(p.created_at) AS latest_version_created_at,
          CAST(COUNT(*) AS int) AS number_of_generations
      FROM 
          prompts p
      WHERE 
          p.project_id = ${projectId}
      GROUP BY 
          p.name
      ORDER BY 
          MAX(p.created_at) DESC
      LIMIT 
          ${limit}
      OFFSET 
          ${limit * (page - 1)}
  `;

  const totalItems = Number(promptsData.length);
  const totalPages = Math.ceil(totalItems / limit);

  return {
    data: promptsData as any,
    // necessary for backwards compatibility as we initially released the /v2/prompts endpoint with this structure which did not match the api spec
    // https://github.com/langfuse/langfuse/issues/2068
    pagination: { page, limit, totalPages, totalItems },
  } as any;
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
