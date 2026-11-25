import { context as otelContext } from "@opentelemetry/api";
import { prisma } from "@langfuse/shared/src/db";
import { addUserToSpan } from "@langfuse/shared/src/server";

// A project can move to another org; an hour bounds how long tags keep the old one.
const ORG_TTL_MS = 60 * 60_000;
const orgIds = new Map<
  string,
  { orgId: Promise<string | undefined>; expiresAt: number }
>();

/** Runs a Topics job with the project's org on its spans and logs, so failures can be grouped by org. */
export async function withTopicsOrg<T>(
  projectId: string,
  job: () => Promise<T>,
): Promise<T> {
  if (orgIds.size >= 10_000) orgIds.clear();
  const now = Date.now();
  let cached = orgIds.get(projectId);
  if (!cached || cached.expiresAt <= now) {
    cached = {
      orgId: prisma.project
        .findUnique({ where: { id: projectId }, select: { orgId: true } })
        .then((project) => project?.orgId)
        .catch(() => undefined),
      expiresAt: now + ORG_TTL_MS,
    };
    orgIds.set(projectId, cached);
  }
  const id = await cached.orgId;
  if (!id) orgIds.delete(projectId);
  // Without an active span there is nothing to tag.
  const withOrg = id ? addUserToSpan({ orgId: id }) : undefined;
  return withOrg ? otelContext.with(withOrg, job) : job();
}
