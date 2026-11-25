import { Prisma } from "../../";

/**
 * The model definitions a project may read: its own, its organization's, and
 * Langfuse's. Every read of `models` on behalf of a project filters with this
 * (or `visibleModelsSql`), so a row owned by another project or organization
 * is never returned.
 */
export const visibleModelsWhere = (projectId: string) =>
  ({
    OR: [
      { scope: "PROJECT", projectId },
      {
        scope: "ORGANIZATION",
        organization: { projects: { some: { id: projectId } } },
      },
      { scope: "LANGFUSE" },
    ],
  }) satisfies Prisma.ModelWhereInput;

/** Raw SQL form of `visibleModelsWhere`. `alias` must be a trusted identifier. */
export const visibleModelsSql = (projectId: string, alias = "models") => {
  const t = Prisma.raw(`"${alias}"`);
  return Prisma.sql`(
    (${t}.scope = 'PROJECT' AND ${t}.project_id = ${projectId})
    OR (${t}.scope = 'ORGANIZATION' AND ${t}.organization_id = (SELECT org_id FROM projects WHERE id = ${projectId}))
    OR ${t}.scope = 'LANGFUSE'
  )`;
};

/**
 * The model definitions an organization manages or inherits: its own and
 * Langfuse's. Project definitions are never included, not even those of the
 * organization's projects. `alias` must be a trusted identifier.
 */
export const organizationModelsSql = (
  organizationId: string,
  alias = "models",
) => {
  const t = Prisma.raw(`"${alias}"`);
  return Prisma.sql`(
    (${t}.scope = 'ORGANIZATION' AND ${t}.organization_id = ${organizationId})
    OR ${t}.scope = 'LANGFUSE'
  )`;
};

/** Sort key for precedence: project before organization before Langfuse. */
export const modelScopeRankSql = (alias = "models") => {
  const t = Prisma.raw(`"${alias}"`);
  return Prisma.sql`CASE ${t}.scope WHEN 'PROJECT' THEN 0 WHEN 'ORGANIZATION' THEN 1 ELSE 2 END`;
};
