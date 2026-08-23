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

import { logger } from "@langfuse/shared/src/server";
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

/** authzMigrationMode gates the seam — shadow logs the new-path outcome, enforce acts on it; the flag itself is authored by the shadow slice. */
const authzMigrationMode: "shadow" | "enforce" =
  process.env.PUBLIC_API_AUTHZ_MIGRATION === "enforce" ? "enforce" : "shadow";

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

/** createAuthedProjectAPIRoutePrototype is the migration seam over the legacy factory: same config plus a required action, logged in shadow mode and acted on at enforce. */
export const createAuthedProjectAPIRoutePrototype = <
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
      // KNOWN LIMITATION: wrapping fn observes only legacy-admitted requests —
      // legacy 401/403s never reach here, so shadow is blind to the
      // new-allows/legacy-denies direction. The production seam lives inside
      // createAuthedProjectAPIRoute's auth step and evaluates both pipelines
      // unconditionally, every outcome captured, neither throwing into the
      // other (LFE-15034 owns what gets emitted).
      if (routeConfig.action !== null) {
        const outcome = await evaluateProjectAction(
          params.req.headers,
          routeConfig.action,
          params.auth.scope.projectId,
        );
        if (authzMigrationMode === "enforce" && !outcome.success) {
          throw outcome.error;
        }
        if (authzMigrationMode === "shadow") {
          // placeholder sink — the counter/log contract is LFE-15034's
          logger.info("PROTOTYPE(LFE-15038) authz shadow decision", {
            route: routeConfig.name,
            action: routeConfig.action,
            success: outcome.success,
            error: outcome.success ? undefined : outcome.error.message,
          });
        }
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

/** evaluateProjectAction runs the new pipeline capturing every failure as an outcome, so shadow mode can log what enforce mode would throw. */
async function evaluateProjectAction(
  headers: IncomingHttpHeaders,
  action: ProjectAction,
  projectId: string,
): Promise<AuthzOutcome> {
  try {
    const context = await authenticate(headers);
    return {
      success: true,
      access: mustAuthorize(context, action, { projectId }),
    };
  } catch (error) {
    if (error instanceof Error) return { success: false, error };
    throw error;
  }
}

/** AuthzOutcome is a whole-pipeline result as a value: the residual access, or the error enforce mode would throw. */
type AuthzOutcome =
  | { success: true; access: Access }
  | { success: false; error: Error };
