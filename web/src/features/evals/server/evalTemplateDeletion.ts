import { type PrismaClient } from "@prisma/client";
import {
  ForbiddenError,
  LangfuseConflictError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { type ApiAccessScope } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import {
  deleteEvalTemplatesByIds,
  findEvalTemplateById,
  findEvalTemplateFamilyVersions,
  findJobConfigurationsReferencingEvalTemplates,
  lockEvalTemplateFamilyVersions,
} from "@/src/features/evals/server/evaluatorRepository";

const MAX_REFERENCING_EVALUATORS_IN_ERROR = 5;

/**
 * Running evaluators (job configs) of the project that reference any version
 * of the template's family. Used to warn before the delete is attempted;
 * deleteEvalTemplateFamily re-checks transactionally.
 */
export async function findEvalTemplateFamilyUsage({
  prisma,
  projectId,
  evalTemplateId,
}: {
  prisma: PrismaClient;
  projectId: string;
  evalTemplateId: string;
}) {
  const template = await findEvalTemplateById({
    tx: prisma,
    id: evalTemplateId,
  });

  if (!template || (template.projectId && template.projectId !== projectId)) {
    throw new LangfuseNotFoundError("Evaluator not found");
  }

  const versions = await findEvalTemplateFamilyVersions({
    tx: prisma,
    projectId: template.projectId,
    name: template.name,
    type: template.type,
  });

  return findJobConfigurationsReferencingEvalTemplates({
    tx: prisma,
    projectId,
    evalTemplateIds: versions.map((version) => version.id),
  });
}

/**
 * Deletes all versions of a project-owned eval template, identified by any
 * version id of the family.
 *
 * Deletion is blocked while any job configuration still references a version,
 * so configs never end up with a dangling template reference (the FK is
 * ON DELETE SET NULL and such configs fail at execution time).
 */
export async function deleteEvalTemplateFamily({
  prisma,
  projectId,
  evalTemplateId,
  auditScope,
  referencingEntityName = "running evaluator",
}: {
  prisma: PrismaClient;
  projectId: string;
  evalTemplateId: string;
  // for API-key callers (public API, MCP); tRPC logs with the user session
  // at the router level instead, like its sibling mutations
  auditScope?: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
  // job configs are "running evaluators" in the UI but "evaluation rules" in
  // the public API contract; the conflict message must match the surface
  referencingEntityName?: string;
}) {
  const template = await findEvalTemplateById({
    tx: prisma,
    id: evalTemplateId,
  });

  if (!template || (template.projectId && template.projectId !== projectId)) {
    throw new LangfuseNotFoundError("Evaluator not found");
  }

  if (!template.projectId) {
    throw new ForbiddenError("Langfuse-managed evaluators cannot be deleted");
  }

  // Resolve versions and check references inside one transaction so the
  // reference check and the delete see a consistent snapshot.
  const deletedVersions = await prisma.$transaction(async (tx) => {
    // lock first: blocks concurrent rule creation (FK takes FOR KEY SHARE on
    // the template row) from slipping in between the check and the delete
    await lockEvalTemplateFamilyVersions({
      tx,
      projectId,
      name: template.name,
      type: template.type,
    });

    const versions = await findEvalTemplateFamilyVersions({
      tx,
      projectId,
      name: template.name,
      type: template.type,
    });
    const versionIds = versions.map((version) => version.id);

    const referencingConfigs =
      await findJobConfigurationsReferencingEvalTemplates({
        tx,
        projectId,
        evalTemplateIds: versionIds,
      });

    if (referencingConfigs.length > 0) {
      throw new LangfuseConflictError(
        buildInUseErrorMessage(
          template.name,
          referencingConfigs,
          referencingEntityName,
        ),
      );
    }

    await deleteEvalTemplatesByIds({
      tx,
      projectId,
      evalTemplateIds: versionIds,
    });

    return versions;
  });

  if (auditScope) {
    await Promise.all(
      deletedVersions.map((version) =>
        auditLog({
          action: "delete",
          resourceType: EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
          resourceId: version.id,
          projectId,
          orgId: auditScope.orgId,
          apiKeyId: auditScope.apiKeyId,
          before: version,
        }),
      ),
    );
  }

  return deletedVersions;
}

function buildInUseErrorMessage(
  templateName: string,
  referencingConfigs: { scoreName: string }[],
  referencingEntityName: string,
) {
  const scoreNames = [
    ...new Set(referencingConfigs.map((config) => config.scoreName)),
  ];
  const shownNames = scoreNames
    .slice(0, MAX_REFERENCING_EVALUATORS_IN_ERROR)
    .map((name) => `"${name}"`)
    .join(", ");
  const overflow =
    scoreNames.length > MAX_REFERENCING_EVALUATORS_IN_ERROR
      ? ` and ${scoreNames.length - MAX_REFERENCING_EVALUATORS_IN_ERROR} more`
      : "";

  // count unique score names, not raw configs: several configs can share a
  // score name and the count must match the listed names
  return `Evaluator "${templateName}" is in use by ${scoreNames.length} ${referencingEntityName}(s): ${shownNames}${overflow}. Delete those ${referencingEntityName}s first.`;
}
