/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/enforcement-seams`,
 * LFE-15038). The header-touching api adapter layer per LFE-15053: fused
 * authenticate-then-enforce wrappers over the header-free PEP, plus the
 * required-action route factory. Exercised by the rewritten call sites;
 * compile-only, no in-source tests (the pure PEP carries them).
 */

import { type IncomingHttpHeaders } from "http";
import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodType } from "zod";

import { UnauthorizedError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { redis, type ApiAccessScope } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import {
  createAuthedProjectAPIRoute,
  type AuthedProjectAPIRouteConfig,
} from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  mustAuthorize,
  type Access,
  type Action,
  type AuthorizationContext,
  type ProjectAction,
} from "./policy.prototype";
import {
  coveringOrg,
  enforceOrgAuthz,
  enforceProjectAuthz,
  resolveContextFromLegacyScope,
} from "./enforce.prototype";

/** enforceProjectAuth authenticates the request and asserts action on its resolved project, one call per route. */
export async function enforceProjectAuth(params: {
  headers: IncomingHttpHeaders;
  action: ProjectAction | null;
}): Promise<{
  context: AuthorizationContext;
  projectId: string;
  access: Access | null;
}> {
  const context = await authenticate(params.headers);
  const { projectId, access } = enforceProjectAuthz({
    context,
    headers: params.headers,
    action: params.action,
  });
  return { context, projectId, access };
}

/** enforceOrgAuth authenticates the request and asserts action on its resolved org, one call per route. */
export async function enforceOrgAuth(params: {
  headers: IncomingHttpHeaders;
  action?: Action;
}): Promise<{
  context: AuthorizationContext;
  orgId: string;
  access: Access | null;
}> {
  const context = await authenticate(params.headers);
  const { orgId, access } = enforceOrgAuthz({
    context,
    headers: params.headers,
    action: params.action,
  });
  return { context, orgId, access };
}

/** authenticate verifies the credential and resolves its AuthorizationContext. */
export async function authenticate(
  headers: IncomingHttpHeaders,
): Promise<AuthorizationContext> {
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(headers.authorization);
  if (!authCheck.validKey) throw new UnauthorizedError(authCheck.error);
  const orgProjectIds =
    authCheck.scope.accessLevel === "organization"
      ? await materializedOrgProjectIds(authCheck.scope.orgId)
      : undefined;
  return resolveContextFromLegacyScope(authCheck.scope, { orgProjectIds });
}

/** legacyScope rebuilds the ApiAccessScope shape the rate-limit and entitlement seams still demand, from the context's covering org. */
export function legacyScope(
  context: AuthorizationContext,
  target: { orgId: string } | { projectId: string },
): ApiAccessScope {
  const org = coveringOrg(context, target);
  return {
    orgId: org?.orgId ?? ("orgId" in target ? target.orgId : ""),
    plan: org?.plan ?? "oss",
    rateLimitOverrides: org?.rateLimitConfig ?? [],
    // dead weight below: RateLimitService reads only the three fields above
    projectId: "projectId" in target ? target.projectId : null,
    accessLevel: "project",
    apiKeyId:
      context.principal.kind === "apiKey"
        ? context.principal.apiKeyId
        : "ADMIN_API_KEY",
    publicKey: "",
    isIngestionSuspended: false,
  };
}

/** createAuthorizedProjectAPIRoute is the migration seam over the legacy factory: same config plus a required action asserted before the handler runs. */
export const createAuthorizedProjectAPIRoute = <
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
>(
  routeConfig: AuthedProjectAPIRouteConfig<TQuery, TBody, TResponse> & {
    action: ProjectAction | null;
  },
): ((req: NextApiRequest, res: NextApiResponse) => Promise<void>) =>
  createAuthedProjectAPIRoute({
    ...routeConfig,
    fn: async (params) => {
      if (routeConfig.action !== null) {
        const context = resolveContextFromLegacyScope(params.auth.scope);
        mustAuthorize(context, routeConfig.action, {
          projectId: params.auth.scope.projectId,
        });
      }
      return routeConfig.fn(params);
    },
  });

/** materializedOrgProjectIds lists the org's non-deleted project ids for the PIP's materialized refs. */
async function materializedOrgProjectIds(orgId: string): Promise<string[]> {
  const projects = await prisma.project.findMany({
    where: { orgId, deletedAt: null },
    select: { id: true },
  });
  return projects.map((p) => p.id);
}
