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
  enforceOrgAuthz,
  enforceProjectAuthz,
  resolveContextFromLegacyScope,
} from "./enforce.prototype";

/** enforceProjectAuth authenticates the request and asserts action on its resolved project, one call per route. */
export async function enforceProjectAuth(params: {
  headers: IncomingHttpHeaders;
  action: ProjectAction | null;
  allowInAppAgentKey?: boolean;
}): Promise<{
  context: AuthorizationContext;
  scope: ApiAccessScope;
  projectId: string;
  access: Access | null;
}> {
  const { context, scope } = await authenticate(params.headers, {
    allowInAppAgentKey: params.allowInAppAgentKey,
  });
  const { projectId, access } = enforceProjectAuthz({
    context,
    headers: params.headers,
    action: params.action,
  });
  return { context, scope, projectId, access };
}

/** enforceOrgAuth authenticates the request and asserts action on its resolved org, one call per route. */
export async function enforceOrgAuth(params: {
  headers: IncomingHttpHeaders;
  action: Action | null;
}): Promise<{
  context: AuthorizationContext;
  scope: ApiAccessScope;
  orgId: string;
  access: Access | null;
}> {
  const { context, scope } = await authenticate(params.headers);
  const { orgId, access } = enforceOrgAuthz({
    context,
    headers: params.headers,
    action: params.action,
  });
  return { context, scope, orgId, access };
}

/** authenticate verifies the credential and resolves its AuthorizationContext; the legacy scope rides along for the rate-limit and entitlement seams. */
export async function authenticate(
  headers: IncomingHttpHeaders,
  opts: { allowInAppAgentKey?: boolean } = {},
): Promise<{ context: AuthorizationContext; scope: ApiAccessScope }> {
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(headers.authorization, {
    allowInAppAgentKey: opts.allowInAppAgentKey === true,
  });
  if (!authCheck.validKey) throw new UnauthorizedError(authCheck.error);
  const orgProjectIds =
    authCheck.scope.accessLevel === "organization"
      ? await materializedOrgProjectIds(authCheck.scope.orgId)
      : undefined;
  const context = resolveContextFromLegacyScope(authCheck.scope, {
    orgProjectIds,
  });
  return { context, scope: authCheck.scope };
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
