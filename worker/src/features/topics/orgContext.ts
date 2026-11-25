import { context as otelContext } from "@opentelemetry/api";
import { prisma } from "@langfuse/shared/src/db";
import { addUserToSpan } from "@langfuse/shared/src/server";

const orgIds = new Map<string, Promise<string | undefined>>();

/** Runs a Topics job with the project's org on its spans and logs, so failures can be grouped by org. */
export async function withTopicsOrg<T>(
  projectId: string,
  job: () => Promise<T>,
): Promise<T> {
  if (orgIds.size >= 10_000) orgIds.clear();
  let orgId = orgIds.get(projectId);
  if (!orgId) {
    orgId = prisma.project
      .findUnique({ where: { id: projectId }, select: { orgId: true } })
      .then((project) => project?.orgId)
      .catch(() => undefined);
    orgIds.set(projectId, orgId);
  }
  const id = await orgId;
  if (!id) orgIds.delete(projectId);
  // Without an active span there is nothing to tag.
  const withOrg = id ? addUserToSpan({ orgId: id }) : undefined;
  return withOrg ? otelContext.with(withOrg, job) : job();
}
