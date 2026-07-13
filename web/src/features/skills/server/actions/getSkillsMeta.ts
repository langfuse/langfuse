import {
  type GetSkillsMetaType,
  type FilterState,
  skillsTableCols,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { tableColumnsToSqlFilterAndPrefix } from "@langfuse/shared/src/server";

export type GetSkillsMetaParams = GetSkillsMetaType & { projectId: string };

export const getSkillsMeta = async (
  params: GetSkillsMetaParams,
): Promise<SkillsMetaResponse> => {
  const { projectId, page, limit } = params;

  const skillsMeta = (await prisma.$queryRaw`
    SELECT
      s.name AS name,
      MAX(s.tags) AS tags,  -- use max to get tags, they are the same for all versions of a skill
      MAX(s.updated_at) as "lastUpdatedAt",
      array_agg(DISTINCT s.version) AS versions,
      COALESCE(array_agg(DISTINCT label) FILTER (WHERE label IS NOT NULL), '{}'::text[]) AS labels --- COALESCE is necessary to return an empty array if there are no labels and remove NULLs
    FROM
        skills s -- needs to be s for filter conditions
    LEFT JOIN LATERAL unnest(s.labels) AS label ON true
    WHERE
        s."project_id" = ${projectId}
        ${getSkillsFilterCondition(params)}
    GROUP BY
        s.name
    ORDER BY
        s.name --- necessary for consistent pagination
    LIMIT
        ${limit}
    OFFSET
        ${limit * (page - 1)}
  `) as SkillsMeta[];

  const [{ count: totalItemsCount }] = (await prisma.$queryRaw`
    SELECT COUNT(DISTINCT s.name) AS count
    FROM skills s
    WHERE "project_id" = ${projectId}
    ${getSkillsFilterCondition(params)}
  `) as { count: BigInt }[];

  const totalItems = Number(totalItemsCount);
  const totalPages = Math.ceil(totalItems / limit);

  return {
    data: skillsMeta,
    meta: { page, limit, totalPages, totalItems },
    pagination: { page, limit, totalPages, totalItems },
  };
};

type SkillsMeta = {
  name: string;
  versions: number[];
  labels: string[];
  tags: string[];
  lastUpdatedAt: Date;
};

export type SkillsMetaResponse = {
  data: SkillsMeta[];
  meta: {
    page: number;
    limit: number;
    totalPages: number;
    totalItems: number;
  };
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    totalItems: number;
  };
};

const getSkillsFilterCondition = (params: GetSkillsMetaType) => {
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

  // "skills" is not a TableNames value; the SQL alias comes from the
  // skillsTableCols internals (s."..."). The table arg only drives
  // observation-specific casts, so "prompts" is a neutral choice here.
  return tableColumnsToSqlFilterAndPrefix(filters, skillsTableCols, "prompts");
};
