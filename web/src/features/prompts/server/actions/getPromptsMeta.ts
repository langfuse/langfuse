import { type GetPromptsMetaType } from "@/src/features/prompts/server/utils/validation";
import { Prisma, prisma } from "@langfuse/shared/src/db";

export type GetPromptsMetaParams = GetPromptsMetaType & { projectId: string };

export const getPromptsMeta = async (
  params: GetPromptsMetaParams,
): Promise<PromptsMetaResponse> => {
  const { projectId, page, limit } = params;

  const promptsMeta = (await prisma.$queryRaw`
    SELECT
        p.name AS "promptName",
        p.tags AS tags,
        array_agg(DISTINCT p.version) AS versions,
        array_agg(DISTINCT label) AS labels
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
    pagination: { page, limit, totalPages, totalItems },
  };
};

type PromptsMeta = {
  promptName: string;
  versions: number[];
  labels: string[];
  tags: string[];
};

export type PromptsMetaResponse = {
  data: PromptsMeta[];
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalItems: number;
  };
};

const getPromptsFilterCondition = (params: GetPromptsMetaType) => {
  const { name, version, label, tag } = params;
  const conditions = [];

  if (name) {
    conditions.push(Prisma.sql`p.name = ${name}`);
  }

  if (version) {
    conditions.push(Prisma.sql`p.version = ${version}`);
  }

  if (label) {
    conditions.push(Prisma.sql`${label} = ANY(p.labels)`);
  }

  if (tag) {
    conditions.push(Prisma.sql`${tag} = ANY(p.tags)`);
  }

  return conditions.length > 0
    ? Prisma.join([Prisma.raw("AND "), Prisma.join(conditions, " AND ")], "")
    : Prisma.empty;
};
