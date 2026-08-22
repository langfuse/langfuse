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
import { enforceOrgAuthz, enforceProjectAuthz } from "./enforce.prototype";

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
        const context = await authenticate(params.req.headers);
        mustAuthorize(context, routeConfig.action, {
          projectId: params.auth.scope.projectId,
        });
      }
      return routeConfig.fn(params);
    },
  });

/** authenticate stands in for ApiAuthService.auth() — the independent new path (Verifier, LFE-15032 → Resolver, LFE-15458) — and is not built on this branch; mock it in tests. */
export async function authenticate(
  headers: IncomingHttpHeaders,
): Promise<AuthorizationContext> {
  void headers;
  throw new Error(
    "PROTOTYPE(LFE-15038): ApiAuthService.auth() = Verifier (LFE-15032) → Resolver (LFE-15458); not built on this branch",
  );
}
