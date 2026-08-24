/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/enforcement-seams`,
 * LFE-15038). The organization api adapter: the fused org seam with its own
 * target resolution, plus the shadow/enforce mode flag and the error
 * vocabulary the sibling adapters share.
 * Run: `pnpm --filter web run test:in-source enforcement.organizations.prototype`.
 */

import { type IncomingHttpHeaders } from "http";

import {
  InvalidRequestError,
  type ForbiddenError,
  type UnauthorizedError,
} from "@langfuse/shared";
import { getCurrentSpan } from "@langfuse/shared/src/server";
import {
  authorize,
  type Access,
  type Action,
  type AuthorizationContext,
  type ErrorResult,
  type Success,
} from "./policy.prototype";
import { headerValue } from "./enforce.prototype";
import { authenticate } from "./identity.prototype";

/** authzMigrationMode gates the adapters — shadow stamps the new-path outcome on the request span, enforce acts on it; the flag itself is authored by the shadow slice. */
export const authzMigrationMode: "shadow" | "enforce" =
  process.env.PUBLIC_API_AUTHZ_MIGRATION === "enforce" ? "enforce" : "shadow";

/** organizationIdHeader selects the target org for keys without a bound org. */
const organizationIdHeader = "x-langfuse-organization-id";

/** enforceOrgAuth runs the new org pipeline — authenticate, target resolution, authorize — returning every outcome as a result value; it never throws one. */
export async function enforceOrgAuth(params: {
  headers: IncomingHttpHeaders;
  action?: Action;
}): Promise<OrgAccessResult | ErrorResult<AuthError>> {
  const { headers, action } = params;
  const authn = await authenticate(headers);
  if (!authn.success) {
    return authn;
  }
  const context = authn.context;
  const target = getOrgId(context, headers);
  if (!target.success) {
    return target;
  }
  const orgId = target.orgId;
  if (action === undefined) {
    return { success: true, context, orgId };
  }
  const decision = authorize(context, action, { orgId });
  if (!decision.success) {
    return { success: false, error: decision.error };
  }
  return { success: true, context, orgId, access: decision.access };
}

/** getOrgId resolves the target org as `header ?? boundResource ?? 400`: disagreement 400s; coverage is the PDP's question. */
function getOrgId(
  context: AuthorizationContext,
  headers: IncomingHttpHeaders,
): ResolvedOrg | ErrorResult<InvalidRequestError> {
  const boundOrgId = boundOrgIdOf(context);
  const header = headerValue(headers[organizationIdHeader]);
  if (header && boundOrgId && header !== boundOrgId) {
    return {
      success: false,
      error: new InvalidRequestError(
        `${organizationIdHeader} disagrees with the API key's organization`,
      ),
    };
  }
  const orgId = header ?? boundOrgId;
  if (!orgId) {
    return {
      success: false,
      error: new InvalidRequestError(
        `No organization target: send ${organizationIdHeader} or use an organization-scoped API key`,
      ),
    };
  }
  return { success: true, orgId };
}

/** tagAuthzOutcome stamps the shadow decision onto the active http.server span, where legacy's status code also lands. */
export function tagAuthzOutcome(
  result: TaggableAccessResult | ErrorResult<AuthError>,
) {
  const span = getCurrentSpan();
  if (!span) {
    return;
  }
  // attribute names are placeholders — the parity contract is LFE-15034's
  if (result.success) {
    span.setAttribute("langfuse.authz.decision", "allow");
    span.setAttribute("langfuse.authz.action", result.access?.action ?? "none");
    if ("projectId" in result) {
      span.setAttribute("langfuse.authz.projectId", result.projectId);
      return;
    }
    span.setAttribute("langfuse.authz.orgId", result.orgId);
    return;
  }
  span.setAttribute("langfuse.authz.decision", "deny");
  span.setAttribute("langfuse.authz.error", result.error.message);
}

/** boundOrgIdOf returns the org an api key is bound to, when any. */
function boundOrgIdOf(context: AuthorizationContext): string | undefined {
  if (context.principal.kind !== "apiKey") {
    return undefined;
  }
  const bound = context.principal.boundResource;
  if (bound && "orgId" in bound) {
    return bound.orgId;
  }
  return undefined;
}

/** OrgAccessResult is the org seam's success outcome: the resolved context and target with the residual access. */
export type OrgAccessResult = Success & {
  context: AuthorizationContext;
  orgId: string;
  access?: Access;
};

/** AuthError enumerates the new pipeline's failures: bad credential, bad or missing target, ungranted action. */
export type AuthError = UnauthorizedError | InvalidRequestError | ForbiddenError;

/** ResolvedOrg is org target resolution's success outcome. */
type ResolvedOrg = Success & { orgId: string };

/** TaggableAccessResult is either seam's success outcome as the span tagger sees it: the resolved target with the residual access. */
type TaggableAccessResult = Success & { access?: Access } & (
    | { projectId: string }
    | { orgId: string }
  );

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const ORG = "org_1";

  const orgKey = (): AuthorizationContext => ({
    principal: {
      kind: "apiKey",
      apiKeyId: "key_1",
      userId: null,
      organizations: [],
      boundResource: { orgId: ORG },
    },
    policies: [],
  });

  const projectKey = (): AuthorizationContext => ({
    principal: {
      kind: "apiKey",
      apiKeyId: "key_2",
      userId: null,
      organizations: [],
      boundResource: { projectId: "prj_1" },
    },
    policies: [],
  });

  describe("getOrgId", () => {
    it("resolves the bound org without a header", () => {
      expect(getOrgId(orgKey(), {})).toEqual({ success: true, orgId: ORG });
    });
    it("resolves a project-bound key's org from the header", () => {
      expect(getOrgId(projectKey(), { [organizationIdHeader]: ORG })).toEqual({
        success: true,
        orgId: ORG,
      });
    });
    it("400s a header disagreeing with the bound org", () => {
      expect(
        getOrgId(orgKey(), { [organizationIdHeader]: "org_x" }),
      ).toMatchObject({
        success: false,
        error: expect.any(InvalidRequestError),
      });
    });
    it("400s a project-bound key without a header", () => {
      expect(getOrgId(projectKey(), {})).toMatchObject({
        success: false,
        error: expect.any(InvalidRequestError),
      });
    });
  });
}
