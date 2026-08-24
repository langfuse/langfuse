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

import { InvalidRequestError } from "@langfuse/shared";
import {
  createAuthedProjectAPIRoute as legacyCreateAuthedProjectAPIRoute,
  type AuthedProjectAPIRouteConfig,
} from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  authorize,
  type Access,
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
  return { success: true, context, projectId, access: decision.access };
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
    // before legacy auth, so shadow also sees the requests legacy rejects;
    // the new decision lands as langfuse.authz.* on the http.server span,
    // legacy's verdict as http.status_code on the same span — the parity
    // diff (LFE-15034) joins them there
    const result = await enforceProjectAuth({
      headers: req.headers,
      action: routeConfig.action,
    });
    if (authzMigrationMode === "shadow") {
      tagAuthzOutcome(result);
      return legacyHandler(req, res);
    }
    if (!result.success) {
      throw result.error;
    }
    return legacyHandler(req, res);
  };
};

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

/** ProjectAccessResult is the project seam's success outcome: the resolved context and target with the residual access. */
type ProjectAccessResult = Success & {
  context: AuthorizationContext;
  projectId: string;
  access?: Access;
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
}
