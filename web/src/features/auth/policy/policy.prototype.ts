/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/policy-core-types`,
 * LFE-15037). Proves the RFC policy-core types compile against Langfuse's real
 * scope vocabularies and that `authorize` behaves. Findings live in the ticket.
 * Run: `pnpm --filter web run test:in-source policy.prototype`.
 */

import {
  projectScopes,
  projectRoleAccessRights,
  type ProjectScope,
} from "@langfuse/shared";
import {
  organizationScopes,
  organizationRoleAccessRights,
  type OrganizationScope,
} from "@/src/features/rbac/constants/organizationAccessRights";

/** ApiAction holds net-new public-API tokens Appendix A adds that projectScopes lacks today. */
export type ApiAction =
  | "traces:read"
  | "ingestion:write"
  | "scores:create"
  | "media:CUD";

/** Action a principal takes on a resource, e.g. "traces:read". */
export type Action = ProjectScope | OrganizationScope | ApiAction | "*";

/** Actions aliases Action for the PEP wrapper signatures. */
export type Actions = Action;

/** Plan stands in for the org plan the PIP attaches; the PDP never reads it. */
type Plan = string;

/** CloudConfig stands in for the org config the PIP attaches; the PDP never reads it. */
type CloudConfig = Record<string, unknown>;

/** PrincipalOrganization carries the org+project config the PIP attaches to a non-admin principal. */
export type PrincipalOrganization = {
  id: string;
  plan: Plan;
  config: CloudConfig;
  projects: { id: string }[];
};

/** Principal is an authorized admin, user, or api key, discriminated on kind. */
export type Principal =
  | { kind: "admin"; userId: string | null }
  | { kind: "user"; id: string; organizations: PrincipalOrganization[] }
  | {
      kind: "apiKey";
      id: string;
      userId: string | null;
      organizations: PrincipalOrganization[];
    };

/** Source describes where a policy came from. */
export type Source =
  | { kind: "role"; id: string }
  | { kind: "grant" }
  | { kind: "system"; rule: "ingestion_suspended" };

/** ResourceRef is a policy's resource matcher; orgId "*" is the everything wildcard, coverage downward. */
export type ResourceRef = { orgId: string | "*"; projectId?: string };

/** Policy grants or denies a set of actions on a set of resources. */
export type Policy = {
  source: Source;
  actions: Action[];
  resources: ResourceRef[];
  effect: "allow" | "deny";
  // conditions?: Condition[]; // optional-add ships when RLS is required (LFE-15149 retired toFilterState)
};

/** AuthorizationContext is the PIP output and PDP input for one principal. */
export type AuthorizationContext = {
  principal: Principal;
  policies: Policy[];
};

/** ForbiddenError stands in for the @langfuse/shared 403 BaseError subclass. */
class ForbiddenError extends Error {}

/** InvalidArgumentError stands in for the @langfuse/shared 400 BaseError subclass. */
class InvalidArgumentError extends Error {}

/** Success is a successful outcome, disjoint from ErrorResult on `success`. */
export type Success = { success: true; error?: never };

/** ErrorResult is a failed outcome carrying the typed error. */
export type ErrorResult<E extends Error> = { success: false; error: E };

/** Decision is a PDP outcome: allowed, or a typed 400/403. */
export type Decision =
  | Success
  | ErrorResult<InvalidArgumentError | ForbiddenError>;

/** Access is what mustAuthorize returns on success. */
export type Access = Success;

/** Resource is the thing being checked; projectId omitted ⇒ an org-level check. */
export type Resource = { orgId: string; projectId?: string };

/** Grant is one org's effective grant for the resolve-style auth/me body. */
export type Grant = {
  organizationId: string;
  projectIds: string[] | "*";
  actions: Action[];
};

/** authorize decides whether the context permits action on resource, deny-overrides. */
export function authorize(
  ctx: AuthorizationContext,
  action: Action,
  resource: Resource,
): Decision {
  const matching = ctx.policies.filter(
    (p) =>
      actionMatches(p.actions, action) &&
      p.resources.some((ref) => resourceCovers(ref, resource)),
  );
  if (matching.some((p) => p.effect === "deny")) {
    return { success: false, error: new ForbiddenError(`denied: ${action}`) };
  }
  if (matching.some((p) => p.effect === "allow")) {
    return { success: true };
  }
  return {
    success: false,
    error: new ForbiddenError(`not permitted: ${action}`),
  };
}

/** mustAuthorize is authorize but throws the 400/403 instead of returning it. */
export function mustAuthorize(
  ctx: AuthorizationContext,
  action: Action,
  resource: Resource,
): Access {
  const decision = authorize(ctx, action, resource);
  if (!decision.success) throw decision.error;
  return decision;
}

/** resolveGrants projects the resolve-style auth/me body from a context (provisional, LFE-15150). */
export function resolveGrants(ctx: AuthorizationContext): Grant[] {
  const byOrg = new Map<
    string,
    { projects: Set<string> | "*"; actions: Set<Action> }
  >();
  for (const p of ctx.policies) {
    if (p.effect !== "allow") continue;
    for (const ref of p.resources) {
      if (ref.orgId === "*") continue; // admin resource is represented out-of-band, never enumerated
      const entry = byOrg.get(ref.orgId) ?? {
        projects: new Set<string>(),
        actions: new Set<Action>(),
      };
      if (ref.projectId === undefined) entry.projects = "*";
      else if (entry.projects !== "*") entry.projects.add(ref.projectId);
      for (const a of p.actions) entry.actions.add(a);
      byOrg.set(ref.orgId, entry);
    }
  }
  return [...byOrg].map(([organizationId, e]) => ({
    organizationId,
    projectIds: e.projects === "*" ? "*" : [...e.projects],
    actions: [...e.actions],
  }));
}

/** actionMatches reports whether granted covers action, explicitly or by wildcard. */
function actionMatches(granted: Action[], action: Action): boolean {
  return granted.includes("*") || granted.includes(action);
}

/** resourceCovers reports whether ref hierarchically covers resource. */
function resourceCovers(ref: ResourceRef, resource: Resource): boolean {
  if (ref.orgId !== "*" && ref.orgId !== resource.orgId) return false;
  if (resource.projectId === undefined) return ref.projectId === undefined;
  return ref.projectId === undefined || ref.projectId === resource.projectId;
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const ORG = "org_1";
  const PRJ = "prj_1";
  const OTHER_PRJ = "prj_2";

  const allow = (actions: Action[], resources: ResourceRef[]): Policy => ({
    source: { kind: "role", id: "OWNER" },
    actions,
    resources,
    effect: "allow",
  });
  const deny = (actions: Action[], resources: ResourceRef[]): Policy => ({
    source: { kind: "system", rule: "ingestion_suspended" },
    actions,
    resources,
    effect: "deny",
  });
  const ctx = (
    policies: Policy[],
    principal?: Principal,
  ): AuthorizationContext => ({
    principal: principal ?? {
      kind: "apiKey",
      id: "key_1",
      userId: null,
      organizations: [
        { id: ORG, plan: "cloud", config: {}, projects: [{ id: PRJ }] },
      ],
    },
    policies,
  });

  describe("authorize — hierarchical coverage", () => {
    const projectSubtree = ctx([allow(["traces:read"], [{ orgId: ORG }])]);
    const singleProject = ctx([
      allow(["traces:read"], [{ orgId: ORG, projectId: PRJ }]),
    ]);

    it.each([
      ["org-subtree ref covers a project", projectSubtree, { orgId: ORG, projectId: PRJ }, true],
      ["single-project ref covers its own project", singleProject, { orgId: ORG, projectId: PRJ }, true],
      ["single-project ref denies a sibling", singleProject, { orgId: ORG, projectId: OTHER_PRJ }, false],
      ["project ref does not cover the org node", singleProject, { orgId: ORG }, false],
      ["wrong org denies", singleProject, { orgId: "org_x", projectId: PRJ }, false],
    ] as const)("%s", (_name, c, resource, expected) => {
      expect(authorize(c, "traces:read", resource as Resource).success).toBe(
        expected,
      );
    });
  });

  describe("authorize — org-level actions", () => {
    const orgAdmin = ctx([allow(["projects:create"], [{ orgId: ORG }])]);
    it("org ref grants an org action on the org node", () => {
      expect(authorize(orgAdmin, "projects:create", { orgId: ORG }).success).toBe(true);
    });
    it("org grant does not leak to another org", () => {
      expect(authorize(orgAdmin, "projects:create", { orgId: "org_x" }).success).toBe(false);
    });
  });

  describe("authorize — admin wildcard has no PDP branch", () => {
    const admin = ctx([allow(["*"], [{ orgId: "*" }])], {
      kind: "admin",
      userId: null,
    });
    it.each([
      ["project action", "traces:read" as Action, { orgId: "x", projectId: "y" }],
      ["org action", "projects:create" as Action, { orgId: "x" }],
    ] as const)("admin allows any %s", (_n, action, resource) => {
      expect(authorize(admin, action, resource as Resource).success).toBe(true);
    });
  });

  describe("authorize — deny-overrides and deny-by-default", () => {
    it("denies by default when nothing matches", () => {
      expect(
        authorize(ctx([]), "traces:read", { orgId: ORG, projectId: PRJ }).success,
      ).toBe(false);
    });
    it("a matching deny beats a matching allow", () => {
      const suspended = ctx([
        allow(["ingestion:write"], [{ orgId: ORG }]),
        deny(["ingestion:write"], [{ orgId: ORG }]),
      ]);
      expect(
        authorize(suspended, "ingestion:write", {
          orgId: ORG,
          projectId: PRJ,
        }).success,
      ).toBe(false);
    });
    it("mustAuthorize throws on denial, returns on success", () => {
      const c = ctx([allow(["traces:read"], [{ orgId: ORG, projectId: PRJ }])]);
      expect(() =>
        mustAuthorize(c, "traces:read", { orgId: ORG, projectId: PRJ }),
      ).not.toThrow();
      expect(() =>
        mustAuthorize(c, "traces:delete", { orgId: ORG, projectId: PRJ }),
      ).toThrow();
    });
  });

  describe("scope-union overlap", () => {
    it("auditLogs:read is the sole token in both vocabularies", () => {
      const overlap = (projectScopes as readonly string[]).filter((s) =>
        (organizationScopes as readonly string[]).includes(s),
      );
      expect(overlap).toEqual(["auditLogs:read"]);
    });
    it("the resource scope disambiguates the overlapping token", () => {
      const projectAudit = ctx([
        allow(["auditLogs:read"], [{ orgId: ORG, projectId: PRJ }]),
      ]);
      expect(
        authorize(projectAudit, "auditLogs:read", { orgId: ORG, projectId: PRJ })
          .success,
      ).toBe(true);
      expect(
        authorize(projectAudit, "auditLogs:read", { orgId: ORG }).success,
      ).toBe(false);
    });
  });

  describe("auth/me derivation", () => {
    it("projects a resolve body from the policy types", () => {
      const grants = resolveGrants(
        ctx([
          allow(["traces:read", "scores:CUD"], [{ orgId: ORG, projectId: PRJ }]),
          allow(["projects:create"], [{ orgId: ORG }]),
        ]),
      );
      expect(grants).toHaveLength(1);
      expect(grants[0].organizationId).toBe(ORG);
      expect(grants[0].projectIds).toBe("*");
      expect(grants[0].actions).toContain("traces:read");
    });
  });

  describe("real role expansions are Action[]", () => {
    it("every role's project and org scopes assign to Action[]", () => {
      const roles = Object.keys(
        projectRoleAccessRights,
      ) as (keyof typeof projectRoleAccessRights)[];
      for (const r of roles) {
        const p: Action[] = projectRoleAccessRights[r];
        const o: Action[] = organizationRoleAccessRights[r];
        expect(Array.isArray(p)).toBe(true);
        expect(Array.isArray(o)).toBe(true);
      }
    });
  });

  describe("type-level invariants", () => {
    it("Principal narrows on kind before organizations", () => {
      const p = { kind: "admin", userId: null } as Principal;
      // @ts-expect-error admin has no organizations without narrowing
      void p.organizations;
      if (p.kind === "apiKey") void p.organizations;
      expect(true).toBe(true);
    });
    it("Success and ErrorResult discriminate under strict", () => {
      const d = { success: true } as Decision;
      const typecheckOnly = () => {
        if (d.success) {
          // @ts-expect-error no error on the success branch
          return d.error.message;
        }
        return d.error.message;
      };
      void typecheckOnly;
      expect(d.success).toBe(true);
    });
  });
}
