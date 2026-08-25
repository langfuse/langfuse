/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/enforcement-seams`,
 * LFE-15038). The project api adapter: the fused project seam with its own
 * target resolution, and the migration factory for project routes — shadow
 * stamps the outcome on the request span, enforce throws.
 * Run: `pnpm --filter web run test:in-source enforcement.projects.prototype`.
 */

import { type IncomingHttpHeaders } from "http";
import { type NextApiRequest, type NextApiResponse } from "next";
import { type ZodType } from "zod";

import { ForbiddenError, InvalidRequestError } from "@langfuse/shared";
import { type AuthHeaderVerificationResult } from "@langfuse/shared/src/server";
import {
  createAuthedProjectAPIRoute as legacyCreateAuthedProjectAPIRoute,
  type AuthedProjectAPIRouteConfig,
} from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  authorize,
  type AuthorizationContext,
  type ErrorResult,
  type ProjectAction,
  type Success,
} from "./policy.prototype";
import { headerValue } from "./enforce.prototype";
import { authenticate } from "./identity.prototype";
import {
  authzMigrationMode,
  tagAuthzOutcome,
  type AuthError,
} from "./enforcement.organizations.prototype";
import {
  newVerdict,
  recordParity,
  verdictFromStatus,
  type AuthorizeSeamResult,
  type NewResult,
  type ParitySink,
} from "./parity.prototype";

/** projectIdHeader selects the target project for keys without a bound project. */
const projectIdHeader = "x-langfuse-project-id";

/** enforceProjectAuth runs the new project pipeline — authenticate, its own target resolution (never legacy's), authorize — returning every outcome as a result value; it never throws one. */
export async function enforceProjectAuth(params: {
  headers: IncomingHttpHeaders;
  action?: ProjectAction;
}): Promise<ProjectAccessResult | ErrorResult<AuthError>> {
  const { headers, action } = params;
  const authn = await authenticate(headers);
  if (!authn.success) {
    return authn;
  }
  const context = authn.context;
  const target = getProjectId(context, headers);
  if (!target.success) {
    return target;
  }
  const projectId = target.projectId;
  if (action === undefined) {
    return { success: true, context, projectId };
  }
  const decision = authorize(context, action, { projectId });
  if (!decision.success) {
    return { success: false, error: decision.error };
  }
  return { success: true, context, projectId };
}

/** createAuthedProjectAPIRoute is the migration seam over the legacy factory: same config plus an optional action, evaluated before legacy auth so every request is observed. */
export const createAuthedProjectAPIRoute = <
  TQuery extends ZodType<any>,
  TBody extends ZodType<any>,
  TResponse extends ZodType<any>,
>(
  routeConfig: AuthedProjectAPIRouteConfig<TQuery, TBody, TResponse> & {
    action?: ProjectAction;
  },
): ((req: NextApiRequest, res: NextApiResponse) => Promise<void>) => {
  const legacyHandler = legacyCreateAuthedProjectAPIRoute(routeConfig);
  return async (req, res) => {
    const result = await enforceProjectAuth({
      headers: req.headers,
      action: routeConfig.action,
    });
    // OPEN QUESTION: this wrapper can only span-tag the NEW verdict — legacy's
    // verdict is locked inside legacyHandler's private verify. Real parity needs
    // authorizeProjectRequest wired INSIDE the factory's auth step (LFE-15038's
    // "seam moves inside the factory"), where the one verify is a value.
    if (authzMigrationMode === "shadow") {
      tagAuthzOutcome(result, routeConfig.action);
      return legacyHandler(req, res);
    }
    if (!result.success) {
      throw result.error;
    }
    return legacyHandler(req, res);
  };
};

/** authorizeProjectRequest is the project chokepoint's shadow-and-enforce method: one legacy verify, the new pipeline beside it, parity emitted from both, then the mode decides. It swaps in for `verifyApiKeyAuth` inside the factory's auth step. */
export async function authorizeProjectRequest(params: {
  headers: IncomingHttpHeaders;
  action: ProjectAction | null;
  verify: () => Promise<AuthHeaderVerificationResult>;
  mode?: "shadow" | "enforce";
  sink?: ParitySink;
}): Promise<AuthorizeSeamResult<ProjectAccessResult | ErrorResult<AuthError>>> {
  const { headers, action, verify, mode = authzMigrationMode, sink } = params;
  const authCheck = await verify();
  const authz = await enforceProjectAuth({ headers, action: action ?? undefined });
  if (mode === "shadow") recordProjectRouteParity(authCheck, authz, action, sink);
  return { authCheck, authz };
}

/** recordProjectRouteParity emits the project-route parity signal from legacy's verify result and the new pipeline's outcome. */
export function recordProjectRouteParity(
  authCheck: AuthHeaderVerificationResult,
  authz: NewResult,
  action: ProjectAction | null,
  sink?: ParitySink,
): void {
  const legacyCode = legacyProjectStatus(authCheck);
  const neu = newVerdict(authz);
  recordParity(
    {
      seam: "project_route",
      action: action ?? "none",
      legacy: verdictFromStatus(legacyCode),
      neu: neu.verdict,
      legacyCode,
      newCode: neu.code,
    },
    sink,
  );
}

/** legacyProjectStatus maps the verify result to the status `verifyApiKeyAuth` sends: 401 unauthenticated, 403 no project target, else 200. */
function legacyProjectStatus(authCheck: AuthHeaderVerificationResult): number {
  if (!authCheck.validKey) return 401;
  if (!authCheck.scope.projectId) return 403;
  return 200;
}

/** getProjectId resolves the target project as `header ?? boundResource ?? 400`: disagreement 400s; coverage is the PDP's question. */
function getProjectId(
  context: AuthorizationContext,
  headers: IncomingHttpHeaders,
): ResolvedProject | ErrorResult<InvalidRequestError> {
  const boundProjectId = boundProjectIdOf(context);
  const header = headerValue(headers[projectIdHeader]);
  if (header && boundProjectId && header !== boundProjectId) {
    return {
      success: false,
      error: new InvalidRequestError(
        `${projectIdHeader} disagrees with the API key's project`,
      ),
    };
  }
  const projectId = header ?? boundProjectId;
  if (!projectId) {
    return {
      success: false,
      error: new InvalidRequestError(
        `No project target: send ${projectIdHeader} or use a project-scoped API key`,
      ),
    };
  }
  return { success: true, projectId };
}

/** boundProjectIdOf returns the project an api key is bound to, when any. */
function boundProjectIdOf(context: AuthorizationContext): string | undefined {
  if (context.principal.kind !== "apiKey") {
    return undefined;
  }
  const bound = context.principal.boundResource;
  if (bound && "projectId" in bound) {
    return bound.projectId;
  }
  return undefined;
}

/** ProjectAccessResult is the project seam's success outcome: the resolved context and target. */
type ProjectAccessResult = Success & {
  context: AuthorizationContext;
  projectId: string;
};

/** ResolvedProject is project target resolution's success outcome. */
type ResolvedProject = Success & { projectId: string };

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const PRJ = "prj_1";

  const projectKey = (): AuthorizationContext => ({
    principal: {
      kind: "apiKey",
      apiKeyId: "key_1",
      userId: null,
      organizations: [],
      boundResource: { projectId: PRJ },
    },
    policies: [],
  });

  const orgKey = (): AuthorizationContext => ({
    principal: {
      kind: "apiKey",
      apiKeyId: "key_2",
      userId: null,
      organizations: [],
      boundResource: { orgId: "org_1" },
    },
    policies: [],
  });

  describe("getProjectId", () => {
    it("resolves the bound project without a header", () => {
      expect(getProjectId(projectKey(), {})).toEqual({
        success: true,
        projectId: PRJ,
      });
    });
    it("resolves an unbound principal from the header", () => {
      expect(getProjectId(orgKey(), { [projectIdHeader]: PRJ })).toEqual({
        success: true,
        projectId: PRJ,
      });
    });
    it("400s a header disagreeing with the bound project", () => {
      expect(
        getProjectId(projectKey(), { [projectIdHeader]: "prj_2" }),
      ).toMatchObject({
        success: false,
        error: expect.any(InvalidRequestError),
      });
    });
    it("400s when neither header nor bound project exists", () => {
      expect(getProjectId(orgKey(), {})).toMatchObject({
        success: false,
        error: expect.any(InvalidRequestError),
      });
    });
  });

  const capture = () => {
    const calls: Record<string, string | number>[] = [];
    const sink: ParitySink = {
      increment: (_stat, tags) => calls.push(tags),
      span: () => undefined,
    };
    return { calls, sink };
  };

  const projectScope = (projectId: string | null) =>
    ({
      validKey: true,
      scope: { projectId, accessLevel: "project" },
    }) as AuthHeaderVerificationResult;

  describe("recordProjectRouteParity", () => {
    it.each([
      ["legacy allows, new allows", projectScope(PRJ), { success: true } as const, "match"],
      [
        "legacy allows, new denies (breakage)",
        projectScope(PRJ),
        { success: false, error: new ForbiddenError() } as const,
        "new_denies",
      ],
      [
        "legacy 403 (org key, no project), new allows (security)",
        projectScope(null),
        { success: true } as const,
        "new_allows",
      ],
      [
        "legacy 401, new denies",
        { validKey: false } as AuthHeaderVerificationResult,
        { success: false, error: new InvalidRequestError() } as const,
        "match",
      ],
    ] as const)("%s", (_name, authCheck, authz, result) => {
      const { calls, sink } = capture();
      recordProjectRouteParity(authCheck, authz, "traces:read", sink);
      expect(calls[0]).toMatchObject({ seam: "project_route", result });
    });
  });
}
