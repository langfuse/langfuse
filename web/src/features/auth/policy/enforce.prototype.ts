/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/enforcement-seams`,
 * LFE-15038). The header-free PEP: request-target resolution and authorization
 * assertion, context-in per LFE-15053/LFE-15149. Findings live in the ticket.
 * Run: `pnpm --filter web run test:in-source enforce.prototype`.
 */

import { type IncomingHttpHeaders } from "http";

import {
  ForbiddenError,
  InvalidRequestError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { organizationScopes } from "@/src/features/rbac/constants/organizationAccessRights";
import {
  authorize,
  mustAuthorize,
  systemRuleMessages,
  type Access,
  type Action,
  type AuthorizationContext,
  type OrganizationAction,
  type Policy,
  type PrincipalOrganization,
  type ProjectAction,
  type Resource,
} from "./policy.prototype";

/** projectIdHeader selects the target project for keys without a bound project. */
export const projectIdHeader = "x-langfuse-project-id";

/** organizationIdHeader selects the target org for keys without a bound org. */
export const organizationIdHeader = "x-langfuse-organization-id";

/** ingestionActionByEventType maps each authorization-relevant ingestion event type to its action; sdk-log needs bare authentication only. */
const ingestionActionByEventType: Record<string, ProjectAction> = {
  "trace-create": "traces:create",
  "event-create": "traces:create",
  "span-create": "traces:create",
  "span-update": "traces:create",
  "generation-create": "traces:create",
  "generation-update": "traces:create",
  "observation-create": "traces:create",
  "observation-update": "traces:create",
  "score-create": "scores:create",
};

/** enforceProjectAuthz resolves the target project and asserts action on it; `action: null` is the greppable authenticated-only opt-out. */
export function enforceProjectAuthz(params: {
  context: AuthorizationContext;
  headers: IncomingHttpHeaders;
  action: ProjectAction | null;
}): { projectId: string; access: Access | null } {
  const { context, headers, action } = params;
  const projectId = getProjectId(context, headers);
  const access =
    action === null ? null : mustAuthorize(context, action, { projectId });
  return { projectId, access };
}

/** enforceOrgAuthz resolves the target org and asserts action on it when given one; project actions org-check into the residual list filter. */
export function enforceOrgAuthz(params: {
  context: AuthorizationContext;
  headers: IncomingHttpHeaders;
  action?: Action;
}): { orgId: string; access: Access | null } {
  const { context, headers, action } = params;
  const orgId = getOrgId(context, headers);
  const access =
    action === undefined
      ? null
      : isOrganizationAction(action)
        ? mustAuthorize(context, action, { orgId })
        : // identical call, other overload: project action against an org node
          mustAuthorize(context, action, { orgId });
  return { orgId, access };
}

/** enforceIngestionAuthz asserts each event family's action on the target project: a system deny fails the whole request, a grant deny rejects per event. */
export function enforceIngestionAuthz(params: {
  context: AuthorizationContext;
  headers: IncomingHttpHeaders;
  batch: unknown[];
}): {
  projectId: string;
  allowedBatch: unknown[];
  rejectedEvents: IngestionAuthzRejection[];
} {
  const { context, headers, batch } = params;
  const projectId = getProjectId(context, headers);
  const allowed = new Set<ProjectAction>();
  const denied = new Map<ProjectAction, string>();
  const allowedBatch: unknown[] = [];
  const rejectedEvents: IngestionAuthzRejection[] = [];
  for (const event of batch) {
    const { id, type } = ingestionEventIdentity(event);
    const action = type ? ingestionActionByEventType[type] : undefined;
    if (action && !allowed.has(action) && !denied.has(action)) {
      const decision = authorize(context, action, { projectId });
      if (decision.success) allowed.add(action);
      else if (isSystemDenyMessage(decision.error.message))
        throw decision.error;
      else denied.set(action, decision.error.message);
    }
    const message = action ? denied.get(action) : undefined; // sdk-log and unknown types pass; schema validation owns unknowns
    if (message !== undefined)
      rejectedEvents.push({
        id,
        status: 403,
        message,
        error: ForbiddenError.name,
      });
    else allowedBatch.push(event);
  }
  return { projectId, allowedBatch, rejectedEvents };
}

/** getProjectId resolves the target project as `header ?? boundResource ?? 400`: disagreement 400s, a project outside the grant 404s. */
export function getProjectId(
  context: AuthorizationContext,
  headers: IncomingHttpHeaders,
): string {
  const bound =
    context.principal.kind === "apiKey"
      ? context.principal.boundResource
      : undefined;
  const boundProjectId =
    bound && "projectId" in bound ? bound.projectId : undefined;
  const header = headerValue(headers[projectIdHeader]);
  if (header && boundProjectId && header !== boundProjectId)
    throw new InvalidRequestError(
      `${projectIdHeader} disagrees with the API key's project`,
    );
  const projectId = header ?? boundProjectId;
  if (!projectId)
    throw new InvalidRequestError(
      `No project target: send ${projectIdHeader} or use a project-scoped API key`,
    );
  if (!principalCoversProject(context, projectId))
    throw new LangfuseNotFoundError("Project not found");
  return projectId;
}

/** getOrgId resolves the target org as `header ?? boundResource ?? 400`: disagreement 400s, an org outside the grant 404s. */
export function getOrgId(
  context: AuthorizationContext,
  headers: IncomingHttpHeaders,
): string {
  const bound =
    context.principal.kind === "apiKey"
      ? context.principal.boundResource
      : undefined;
  const boundOrgId = bound && "orgId" in bound ? bound.orgId : undefined;
  const header = headerValue(headers[organizationIdHeader]);
  if (header && boundOrgId && header !== boundOrgId)
    throw new InvalidRequestError(
      `${organizationIdHeader} disagrees with the API key's organization`,
    );
  const orgId = header ?? boundOrgId;
  if (!orgId)
    throw new InvalidRequestError(
      `No organization target: send ${organizationIdHeader} or use an organization-scoped API key`,
    );
  if (!principalCoversOrg(context, orgId))
    throw new LangfuseNotFoundError("Organization not found");
  return orgId;
}

/** isOrganizationAction narrows an action to the org vocabulary for overload selection. */
const isOrganizationAction = (action: Action): action is OrganizationAction =>
  action === "*" ||
  (organizationScopes as readonly string[]).includes(action);

/** headerValue normalizes a possibly-repeated header to its first value. */
const headerValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** coveringOrg returns the principal organization covering the target, when one exists. */
export const coveringOrg = (
  context: AuthorizationContext,
  target: { orgId: string } | { projectId: string },
): PrincipalOrganization | undefined =>
  context.principal.kind === "admin"
    ? undefined
    : context.principal.organizations.find((o) =>
        "orgId" in target
          ? o.orgId === target.orgId
          : o.projectIds.includes(target.projectId),
      );

/** principalCoversProject reports whether any of the principal's orgs carries the project; admins cover everything. */
const principalCoversProject = (
  context: AuthorizationContext,
  projectId: string,
): boolean =>
  context.principal.kind === "admin" ||
  coveringOrg(context, { projectId }) !== undefined;

/** principalCoversOrg reports whether the principal belongs to the org; admins cover everything. */
const principalCoversOrg = (
  context: AuthorizationContext,
  orgId: string,
): boolean =>
  context.principal.kind === "admin" ||
  coveringOrg(context, { orgId }) !== undefined;

/** isSystemDenyMessage reports whether a 403 message came from a system deny rule. */
const isSystemDenyMessage = (message: string): boolean =>
  Object.values(systemRuleMessages).includes(message);

/** ingestionEventIdentity extracts the id and type an ingestion event claims, before schema validation. */
const ingestionEventIdentity = (
  event: unknown,
): { id: string; type: string | null } => {
  const record =
    typeof event === "object" && event !== null
      ? (event as { id?: unknown; type?: unknown })
      : null;
  return {
    id: record && typeof record.id === "string" ? record.id : "unknown",
    type: record && typeof record.type === "string" ? record.type : null,
  };
};

/** IngestionAuthzRejection mirrors the per-event error shape of the 207 ingestion response. */
export type IngestionAuthzRejection = {
  id: string;
  status: number;
  message: string;
  error: string;
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const ORG = "org_1";
  const PRJ = "prj_1";
  const OTHER_PRJ = "prj_2";

  const organization = (projectIds: string[]): PrincipalOrganization => ({
    orgId: ORG,
    plan: "cloud:hobby",
    rateLimitConfig: [],
    projectIds,
  });

  const grantProject = (
    actions: ProjectAction[],
    projectIds: string[],
  ): Policy => ({
    kind: "project",
    source: { kind: "grant" },
    actions,
    resources: [{ orgId: ORG, projectIds }],
    effect: "allow",
  });

  const suspensionDenies = (projectIds: string[]): Policy[] => [
    {
      kind: "project",
      source: { kind: "system", rule: "ingestion_suspended" },
      actions: ["traces:create", "scores:create", "media:create"],
      resources: [{ orgId: ORG, projectIds }],
      effect: "deny",
    },
    {
      kind: "project",
      source: { kind: "system", rule: "mcp_disabled" },
      actions: ["mcp:access"],
      resources: [{ orgId: ORG, projectIds }],
      effect: "deny",
    },
  ];

  const apiKey = (params: {
    boundResource: Resource;
    organizations: PrincipalOrganization[];
    policies: Policy[];
  }): AuthorizationContext => ({
    principal: {
      kind: "apiKey",
      apiKeyId: "key_1",
      userId: null,
      organizations: params.organizations,
      boundResource: params.boundResource,
    },
    policies: params.policies,
  });

  const projectKey = (policies: Policy[] = [grantProject(["*"], [PRJ])]) =>
    apiKey({
      boundResource: { projectId: PRJ },
      organizations: [organization([PRJ])],
      policies,
    });

  const orgKey = () =>
    apiKey({
      boundResource: { orgId: ORG },
      organizations: [organization([PRJ, OTHER_PRJ])],
      policies: [
        {
          kind: "organization",
          source: { kind: "grant" },
          actions: ["*"],
          resources: [{ orgId: ORG }],
          effect: "allow",
        },
        grantProject(["projects:read"], [PRJ, OTHER_PRJ]),
      ],
    });

  const scoresKey = () => projectKey([grantProject(["scores:create"], [PRJ])]);

  const suspendedKey = () =>
    projectKey([grantProject(["*"], [PRJ]), ...suspensionDenies([PRJ])]);

  const adminKey = (): AuthorizationContext => ({
    principal: { kind: "admin", userId: null },
    policies: [
      {
        kind: "organization",
        source: { kind: "grant" },
        actions: ["*"],
        resources: ["*"],
        effect: "allow",
      },
      {
        kind: "project",
        source: { kind: "grant" },
        actions: ["*"],
        resources: ["*"],
        effect: "allow",
      },
    ],
  });

  describe("getProjectId", () => {
    it("resolves the bound project without a header", () => {
      expect(getProjectId(projectKey(), {})).toBe(PRJ);
    });
    it("accepts an agreeing header", () => {
      expect(getProjectId(projectKey(), { [projectIdHeader]: PRJ })).toBe(PRJ);
    });
    it("400s a header disagreeing with the bound project", () => {
      expect(() =>
        getProjectId(projectKey(), { [projectIdHeader]: OTHER_PRJ }),
      ).toThrow(InvalidRequestError);
    });
    it("400s when neither header nor bound project exists", () => {
      expect(() => getProjectId(orgKey(), {})).toThrow(InvalidRequestError);
    });
    it("resolves an unbound principal from the header", () => {
      expect(getProjectId(orgKey(), { [projectIdHeader]: PRJ })).toBe(PRJ);
    });
    it("404s a project outside every organization", () => {
      expect(() =>
        getProjectId(orgKey(), { [projectIdHeader]: "prj_x" }),
      ).toThrow(LangfuseNotFoundError);
    });
    it("resolves for an admin from the header alone", () => {
      expect(getProjectId(adminKey(), { [projectIdHeader]: "prj_x" })).toBe(
        "prj_x",
      );
    });
  });

  describe("getOrgId", () => {
    it("resolves the bound org without a header", () => {
      expect(getOrgId(orgKey(), {})).toBe(ORG);
    });
    it("400s a header disagreeing with the bound org", () => {
      expect(() =>
        getOrgId(orgKey(), { [organizationIdHeader]: "org_x" }),
      ).toThrow(InvalidRequestError);
    });
    it("400s a project-bound key without a header", () => {
      expect(() => getOrgId(projectKey(), {})).toThrow(InvalidRequestError);
    });
    it("resolves a project-bound key's own org from the header", () => {
      expect(getOrgId(projectKey(), { [organizationIdHeader]: ORG })).toBe(ORG);
    });
    it("404s an org outside the grant", () => {
      expect(() =>
        getOrgId(projectKey(), { [organizationIdHeader]: "org_x" }),
      ).toThrow(LangfuseNotFoundError);
    });
  });

  describe("enforceProjectAuthz", () => {
    it("returns a null access filter for the authenticated-only opt-out", () => {
      const { projectId, access } = enforceProjectAuthz({
        context: projectKey(),
        headers: {},
        action: null,
      });
      expect(projectId).toBe(PRJ);
      expect(access).toBeNull();
    });
    it("returns the residual filter on a granted action", () => {
      const { access } = enforceProjectAuthz({
        context: projectKey(),
        headers: {},
        action: "traces:read",
      });
      expect(access?.includes).toEqual([{ orgId: ORG, projectIds: [PRJ] }]);
    });
    it("403s an ungranted action", () => {
      expect(() =>
        enforceProjectAuthz({
          context: orgKey(),
          headers: { [projectIdHeader]: PRJ },
          action: "traces:read",
        }),
      ).toThrow(ForbiddenError);
    });
    it("compile-enforces the action declaration", () => {
      const omitted = () =>
        // @ts-expect-error action is required; null is the explicit opt-out
        enforceProjectAuthz({ context: projectKey(), headers: {} });
      const orgAction = () =>
        enforceProjectAuthz({
          context: projectKey(),
          headers: {},
          // @ts-expect-error projects:create is an org action
          action: "projects:create",
        });
      void omitted;
      void orgAction;
      expect(true).toBe(true);
    });
  });

  describe("enforceOrgAuthz", () => {
    it("omitting action is authenticated-only", () => {
      const { orgId, access } = enforceOrgAuthz({
        context: orgKey(),
        headers: {},
      });
      expect(orgId).toBe(ORG);
      expect(access).toBeNull();
    });
    it("grants an org action to an org key", () => {
      const { orgId } = enforceOrgAuthz({
        context: orgKey(),
        headers: {},
        action: "projects:create",
      });
      expect(orgId).toBe(ORG);
    });
    it("403s an org action for a project key", () => {
      expect(() =>
        enforceOrgAuthz({
          context: projectKey(),
          headers: { [organizationIdHeader]: ORG },
          action: "projects:create",
        }),
      ).toThrow(ForbiddenError);
    });
    it("org-checks a project action into the residual list filter", () => {
      const { access } = enforceOrgAuthz({
        context: orgKey(),
        headers: {},
        action: "projects:read",
      });
      expect(access?.includes).toEqual([
        { orgId: ORG, projectIds: [PRJ, OTHER_PRJ] },
      ]);
    });
  });

  describe("enforceIngestionAuthz", () => {
    const batch = [
      { id: "e1", type: "trace-create" },
      { id: "e2", type: "score-create" },
      { id: "e3", type: "sdk-log" },
    ];
    it("passes a full batch for a project key", () => {
      const { projectId, rejectedEvents } = enforceIngestionAuthz({
        context: projectKey(),
        headers: {},
        batch,
      });
      expect(projectId).toBe(PRJ);
      expect(rejectedEvents).toEqual([]);
    });
    it("rejects per event on a grant deny, keeping the allowed family", () => {
      const { rejectedEvents } = enforceIngestionAuthz({
        context: scoresKey(),
        headers: {},
        batch,
      });
      expect(rejectedEvents.map((e) => e.id)).toEqual(["e1"]);
    });
    it("fails the whole request on suspension with the legacy message", () => {
      expect(() =>
        enforceIngestionAuthz({
          context: suspendedKey(),
          headers: {},
          batch,
        }),
      ).toThrow(systemRuleMessages.ingestion_suspended);
    });
    it("passes an sdk-log-only batch under suspension (known divergence: legacy 403s)", () => {
      const { rejectedEvents } = enforceIngestionAuthz({
        context: suspendedKey(),
        headers: {},
        batch: [{ id: "e1", type: "sdk-log" }],
      });
      expect(rejectedEvents).toEqual([]);
    });
  });
}
