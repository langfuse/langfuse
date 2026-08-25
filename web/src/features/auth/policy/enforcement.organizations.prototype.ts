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
import {
  getCurrentSpan,
  type AuthHeaderVerificationResult,
} from "@langfuse/shared/src/server";
import {
  authorize,
  type Action,
  type AuthorizationContext,
  type ErrorResult,
  type Success,
} from "./policy.prototype";
import { headerValue } from "./enforce.prototype";
import { authenticate } from "./identity.prototype";
import {
  newVerdict,
  recordParity,
  verdictFromStatus,
  type AuthorizeSeamResult,
  type NewResult,
  type ParitySink,
} from "./parity.prototype";

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
  return { success: true, context, orgId };
}

/** authorizeOrgRequest is the org chokepoint's shadow-and-enforce method: one legacy verify, the new pipeline beside it, parity emitted from both, then the mode decides. It swaps in for the route's inline `verifyAuthHeaderAndReturnScope`. */
export async function authorizeOrgRequest(params: {
  headers: IncomingHttpHeaders;
  action: Action | null;
  verify: () => Promise<AuthHeaderVerificationResult>;
  mode?: "shadow" | "enforce";
  sink?: ParitySink;
}): Promise<AuthorizeSeamResult<OrgAccessResult | ErrorResult<AuthError>>> {
  const { headers, action, verify, mode = authzMigrationMode, sink } = params;
  const authCheck = await verify();
  const authz = await enforceOrgAuth({ headers, action: action ?? undefined });
  if (mode === "shadow") recordOrgRouteParity(authCheck, authz, action, sink);
  return { authCheck, authz };
}

/** recordOrgRouteParity emits the org-route parity signal from legacy's verify result and the new pipeline's outcome; the `admin-api` entitlement 403 stays outside, identical on both paths. */
export function recordOrgRouteParity(
  authCheck: AuthHeaderVerificationResult,
  authz: NewResult,
  action: Action | null,
  sink?: ParitySink,
): void {
  const legacyCode = legacyOrgStatus(authCheck);
  const neu = newVerdict(authz);
  recordParity(
    {
      seam: "org_route",
      action: action ?? "none",
      legacy: verdictFromStatus(legacyCode),
      neu: neu.verdict,
      legacyCode,
      newCode: neu.code,
    },
    sink,
  );
}

/** legacyOrgStatus maps the verify result to the inlined org gate's status: 401 unauthenticated, 403 non-org key, else 200. */
function legacyOrgStatus(authCheck: AuthHeaderVerificationResult): number {
  if (!authCheck.validKey) return 401;
  if (authCheck.scope.accessLevel !== "organization" || !authCheck.scope.orgId)
    return 403;
  return 200;
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
  action: Action | undefined,
) {
  const span = getCurrentSpan();
  if (!span) {
    return;
  }
  // attribute names are placeholders — the parity contract is LFE-15034's
  if (result.success) {
    span.setAttribute("langfuse.authz.decision", "allow");
    span.setAttribute("langfuse.authz.action", action ?? "none");
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

/** OrgAccessResult is the org seam's success outcome: the resolved context and target. */
export type OrgAccessResult = Success & {
  context: AuthorizationContext;
  orgId: string;
};

/** AuthError enumerates the new pipeline's failures: bad credential, bad or missing target, ungranted action. */
export type AuthError = UnauthorizedError | InvalidRequestError | ForbiddenError;

/** ResolvedOrg is org target resolution's success outcome. */
type ResolvedOrg = Success & { orgId: string };

/** TaggableAccessResult is either seam's success outcome as the span tagger sees it: the resolved target. */
type TaggableAccessResult = Success & (
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

  const capture = () => {
    const calls: Record<string, string | number>[] = [];
    const sink: ParitySink = {
      increment: (_stat, tags) => calls.push(tags),
      span: () => undefined,
    };
    return { calls, sink };
  };

  const orgCheck = (accessLevel: string, orgId?: string) =>
    ({ validKey: true, scope: { accessLevel, orgId } }) as AuthHeaderVerificationResult;

  describe("recordOrgRouteParity", () => {
    it.each([
      ["legacy org key, new allows", orgCheck("organization", ORG), { success: true } as const, "match"],
      [
        "legacy project key (403), new allows (security)",
        orgCheck("project"),
        { success: true } as const,
        "new_allows",
      ],
      [
        "legacy org key, new denies (breakage)",
        orgCheck("organization", ORG),
        { success: false, error: new InvalidRequestError() } as const,
        "new_denies",
      ],
    ] as const)("%s", (_name, authCheck, authz, result) => {
      const { calls, sink } = capture();
      recordOrgRouteParity(authCheck, authz, "projects:read", sink);
      expect(calls[0]).toMatchObject({ seam: "org_route", result });
    });
  });
}
