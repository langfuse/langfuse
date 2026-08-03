import { EvalTemplateType, Prisma } from "@langfuse/shared/src/db";

/**
 * Data access for eval templates ("evaluators" in the public naming).
 * All functions take a `tx` so callers can compose them inside transactions;
 * pass the plain prisma client when no transaction is needed.
 */

export async function findDefaultModelEvalTemplateIds({
  tx,
  projectId,
}: {
  tx: Prisma.TransactionClient;
  projectId: string;
}) {
  const evalTemplates = await tx.evalTemplate.findMany({
    where: {
      OR: [{ projectId }, { projectId: null }],
      provider: null,
      model: null,
      type: EvalTemplateType.LLM_AS_JUDGE,
    },
    select: {
      id: true,
    },
  });

  return evalTemplates.map((template) => template.id);
}

export async function findEvalTemplateById({
  tx,
  id,
}: {
  tx: Prisma.TransactionClient;
  id: string;
}) {
  return tx.evalTemplate.findUnique({ where: { id } });
}

/**
 * All versions of a template family. A family is (projectId, name, type) —
 * the same grouping the evaluator library table uses for versioning.
 */
export async function findEvalTemplateFamilyVersions({
  tx,
  projectId,
  name,
  type,
}: {
  tx: Prisma.TransactionClient;
  // null resolves the versions of a Langfuse-managed (global) family
  projectId: string | null;
  name: string;
  type: EvalTemplateType;
}) {
  return tx.evalTemplate.findMany({
    where: { projectId, name, type },
  });
}

/**
 * Locks all versions of a template family (FOR UPDATE) for the rest of the
 * transaction. Concurrent job-configuration inserts take FOR KEY SHARE on the
 * referenced template row via the FK, which conflicts with this lock — so a
 * rule created concurrently is either visible to a subsequent reference check
 * or fails its FK once the delete commits.
 */
export async function lockEvalTemplateFamilyVersions({
  tx,
  projectId,
  name,
  type,
}: {
  tx: Prisma.TransactionClient;
  projectId: string;
  name: string;
  type: EvalTemplateType;
}) {
  await tx.$queryRaw(
    Prisma.sql`
      SELECT id
      FROM eval_templates
      WHERE project_id = ${projectId}
        AND name = ${name}
        AND type = ${type}::"EvalTemplateType"
      FOR UPDATE
    `,
  );
}

export async function findJobConfigurationsReferencingEvalTemplates({
  tx,
  projectId,
  evalTemplateIds,
}: {
  tx: Prisma.TransactionClient;
  projectId: string;
  evalTemplateIds: string[];
}) {
  return tx.jobConfiguration.findMany({
    where: { projectId, evalTemplateId: { in: evalTemplateIds } },
    select: { id: true, scoreName: true },
  });
}

export async function deleteEvalTemplatesByIds({
  tx,
  projectId,
  evalTemplateIds,
}: {
  tx: Prisma.TransactionClient;
  projectId: string;
  evalTemplateIds: string[];
}) {
  await tx.evalTemplate.deleteMany({
    where: { projectId, id: { in: evalTemplateIds } },
  });
}
