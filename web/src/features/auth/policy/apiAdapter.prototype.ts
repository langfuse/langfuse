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

import { BaseError } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import {
  createAuthedProjectAPIRoute as legacyCreateAuthedProjectAPIRoute,
  type AuthedProjectAPIRouteConfig,
} from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  authorize,
  type Access,
  type Action,
  type AuthorizationContext,
  type ErrorResult,
  type ProjectAction,
  type Success,
} from "./policy.prototype";
import { enforceOrgAuthz, getProjectId } from "./enforce.prototype";

/** authzMigrationMode gates the seam — shadow logs the new-path outcome, enforce acts on it; the flag itself is authored by the shadow slice. */
const authzMigrationMode: "shadow" | "enforce" =
  process.env.PUBLIC_API_AUTHZ_MIGRATION === "enforce" ? "enforce" : "shadow";

/** enforceProjectAuth runs the new pipeline — its own target resolution, never legacy's — as the one uniform seam: a failure throws at enforce, and in shadow is logged and returned as the error result while legacy keeps gating. */
export async function enforceProjectAuth(params: {
  headers: IncomingHttpHeaders;
  action: ProjectAction | null;
}): Promise<EnforcedProject | ErrorResult<BaseError>> {
  const { headers, action } = params;
  try {
    const context = await authenticate(headers);
    const projectId = getProjectId(context, headers);
    const decision =
      action === null ? null : authorize(context, action, { projectId });
    if (decision && !decision.success) return failOrLog(decision.error, action);
    return {
      success: true,
      context,
      projectId,
      access: decision?.access ?? null,
    };
  } catch (error) {
    // authentication and target resolution throw today; they too become
    // decision values once the seam moves inside the factory's auth step
    if (error instanceof BaseError) return failOrLog(error, action);
    throw error;
  }
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

/** createAuthedProjectAPIRoute is the migration seam over the legacy factory: same config plus a required action, logged in shadow mode and acted on at enforce. */
export const createAuthedProjectAPIRoute = <
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
>(
  routeConfig: AuthedProjectAPIRouteConfig<TQuery, TBody, TResponse> & {
    action: ProjectAction | null;
  },
): ((req: NextApiRequest, res: NextApiResponse) => Promise<void>) =>
  legacyCreateAuthedProjectAPIRoute({
    ...routeConfig,
    fn: async (params) => {
      // KNOWN LIMITATION: wrapping fn observes only legacy-admitted requests —
      // legacy 401/403s never reach here, so shadow is blind to the
      // new-allows/legacy-denies direction. The production seam lives inside
      // createAuthedProjectAPIRoute's auth step and evaluates both pipelines
      // unconditionally, every outcome captured, neither throwing into the
      // other (LFE-15034 owns what gets emitted).
      await enforceProjectAuth({
        headers: params.req.headers,
        action: routeConfig.action,
      });
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

/** failOrLog throws the pipeline failure at enforce; in shadow it logs it and returns the error result, legacy still gating the request. */
function failOrLog(
  error: BaseError,
  action: ProjectAction | null,
): ErrorResult<BaseError> {
  if (authzMigrationMode === "enforce") throw error;
  // placeholder sink — the counter/log contract is LFE-15034's
  logger.info("PROTOTYPE(LFE-15038) authz shadow decision", {
    action,
    error: error.message,
  });
  return { success: false, error };
}

/** EnforcedProject is the seam's success outcome: the resolved context and target with the residual access. */
type EnforcedProject = Success & {
  context: AuthorizationContext;
  projectId: string;
  access: Access | null;
};
