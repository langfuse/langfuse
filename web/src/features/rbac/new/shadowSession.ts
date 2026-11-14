import { createHash } from "node:crypto";
import { type Session } from "next-auth";
import { type JWT } from "next-auth/jwt";

import { projectScopes, type Role } from "@langfuse/shared";
import {
  organizationScopes,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  type ResourceId,
} from "@langfuse/shared/rbac";
import {
  getCurrentSpan,
  logger,
  recordHistogram,
  recordIncrement,
  redis,
} from "@langfuse/shared/src/server";

import * as legacyAccessors from "@/src/features/auth/lib/sessionAccessors";
import {
  entitlementAccess,
  type Entitlement,
  type EntitlementLimit,
} from "@/src/features/entitlements/constants/entitlements";
import { getSessionPlan as legacyGetSessionPlan } from "@/src/features/entitlements/hooks";
import { hasEntitlement as legacyHasEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { hasEntitlementLimit as legacyHasEntitlementLimit } from "@/src/features/entitlements/server/hasEntitlementLimit";
import { getInAppAgentApiAccessScope as legacyGetInAppAgentApiAccessScope } from "@/src/features/in-app-agent/server/rateLimit";
import {
  shadowSessionDiff,
  type SessionDiff,
  type Telemetry,
} from "@/src/features/public-api/server/shadowAuthDiff";
import { hasOrganizationAccess as legacyHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { hasProjectAccess as legacyHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { hasOrganizationAccess } from "./checkOrganizationAccess";
import { hasProjectAccess } from "./checkProjectAccess";
import {
  getSessionPlan,
  hasEntitlement,
  hasEntitlementLimit,
} from "./entitlements";
import { getInAppAgentApiAccessScope } from "./rateLimit";
import { rolesFor } from "./rolesFor";
import * as policyAccessors from "./sessionAccessors";
import { sessionCallback, type PolicySession } from "./sessionCallback";

/** throttleSeconds is how long one user and role fingerprint stays compared. */
const throttleSeconds = 86_400;

/** latencyStat times building the policy-engine session. */
const latencyStat = "langfuse.authz.shadow_session.duration_ms";

/** errorStat counts shadow runs that failed. */
const errorStat = "langfuse.authz.shadow_session.error";

/** sessionHelpers pairs each argument-free accessor's legacy and policy-engine version. */
const sessionHelpers: HelperPair[] = [
  [
    "hasSessionUser",
    legacyAccessors.hasSessionUser,
    policyAccessors.hasSessionUser,
  ],
  [
    "getSessionUserId",
    legacyAccessors.getSessionUserId,
    policyAccessors.getSessionUserId,
  ],
  [
    "getSessionUserEmail",
    legacyAccessors.getSessionUserEmail,
    policyAccessors.getSessionUserEmail,
  ],
  [
    "getSessionUserName",
    legacyAccessors.getSessionUserName,
    policyAccessors.getSessionUserName,
  ],
  [
    "getSessionUserImage",
    legacyAccessors.getSessionUserImage,
    policyAccessors.getSessionUserImage,
  ],
  [
    "getSessionUserFeatureFlags",
    legacyAccessors.getSessionUserFeatureFlags,
    policyAccessors.getSessionUserFeatureFlags,
  ],
  [
    "getSessionUserV4BetaEnabled",
    legacyAccessors.getSessionUserV4BetaEnabled,
    policyAccessors.getSessionUserV4BetaEnabled,
  ],
  [
    "getSessionUserCanToggleV4",
    legacyAccessors.getSessionUserCanToggleV4,
    policyAccessors.getSessionUserCanToggleV4,
  ],
  [
    "getSessionUserV4UpgradeUiAvailable",
    legacyAccessors.getSessionUserV4UpgradeUiAvailable,
    policyAccessors.getSessionUserV4UpgradeUiAvailable,
  ],
  [
    "getSessionUserCanCreateOrganizations",
    legacyAccessors.getSessionUserCanCreateOrganizations,
    policyAccessors.getSessionUserCanCreateOrganizations,
  ],
  [
    "getSessionUserHasPassword",
    legacyAccessors.getSessionUserHasPassword,
    policyAccessors.getSessionUserHasPassword,
  ],
  [
    "getSessionEnvironment",
    legacyAccessors.getSessionEnvironment,
    policyAccessors.getSessionEnvironment,
  ],
  [
    "getSessionOrganizations",
    (session) =>
      byId(
        legacyAccessors
          .getSessionOrganizations(session)
          .map((org) => withoutRoles(org)!),
      ),
    (session) => byId(policyAccessors.getSessionOrganizations(session)),
  ],
  [
    "getSessionProjects",
    (session) =>
      byId(legacyAccessors.getSessionProjects(session).map(withoutRole)),
    (session) => byId(policyAccessors.getSessionProjects(session)),
  ],
];

/** allEntitlements is every entitlement some plan grants. */
const allEntitlements: Entitlement[] = [
  ...new Set(Object.values(entitlementAccess).flatMap((p) => p.entitlements)),
];

/** allEntitlementLimits is every entitlement limit a plan sets. */
const allEntitlementLimits = Object.keys(
  entitlementAccess.oss.entitlementLimits,
) as EntitlementLimit[];

/** defaultDeps throttles on redis, builds the session through the policy engine and reports to dogstatsd. */
const defaultDeps: ShadowSessionDeps = {
  setIfAbsent: async (key, ttlSeconds) => {
    if (!redis || redis.status !== "ready") return false;
    return (await redis.set(key, "1", "EX", ttlSeconds, "NX")) === "OK";
  },
  buildSession: (token, session) => sessionCallback({ session, token }),
  telemetry: {
    increment: (stat, tags) => recordIncrement(stat, 1, tags),
    span: () => getCurrentSpan(),
  },
  histogram: (stat, value) => recordHistogram(stat, value),
};

/** shadowSession compares every session helper on the legacy session against the policy-engine session, at most once a day per user and role fingerprint, and never throws. */
export async function shadowSession(
  token: JWT,
  legacySession: Session,
  deps: ShadowSessionDeps = defaultDeps,
): Promise<void> {
  try {
    await compareOnce(token, legacySession, deps);
  } catch (error) {
    logger.warn("Session authorization shadow failed", {
      error: String(error),
    });
    deps.telemetry.increment(errorStat, { surface: "session" });
  }
}

/** compareOnce builds the policy-engine session and reports its differences unless this user and fingerprint were compared within the throttle window. */
async function compareOnce(
  token: JWT,
  legacySession: Session,
  deps: ShadowSessionDeps,
): Promise<void> {
  if (!token.sub) return;
  const key = `authz:shadow:${token.sub}:${fingerprint(legacySession)}`;
  if (!(await deps.setIfAbsent(key, throttleSeconds))) return;
  const startedAt = performance.now();
  const policySession = await deps.buildSession(token, legacySession);
  deps.histogram(latencyStat, performance.now() - startedAt);
  const userId = { user_id: token.sub };
  for (const diff of diffSessions(legacySession, policySession)) {
    shadowSessionDiff(
      { ...diff, ids: { ...userId, ...diff.ids } },
      deps.telemetry,
    );
  }
}

/** fingerprint hashes the legacy session's org, role, plan and project role tuples. */
function fingerprint(session: Session): string {
  const tuples = (session.user?.organizations ?? []).flatMap((org) =>
    roleTuples(org),
  );
  return createHash("sha256")
    .update(JSON.stringify(tuples.sort()))
    .digest("hex")
    .slice(0, 16);
}

/** roleTuples lists an org's role and plan with each of its project roles. */
function roleTuples(
  org: NonNullable<Session["user"]>["organizations"][number],
): string[] {
  const orgTuple = [org.id, org.role, org.plan].join(":");
  if (org.projects.length === 0) return [orgTuple];
  return org.projects.map((project) =>
    [orgTuple, project.id, project.role].join(":"),
  );
}

/** diffSessions runs every helper for every argument the sessions imply and keeps the calls whose results differ. */
function diffSessions(legacy: Session, policy: PolicySession): SessionDiff[] {
  return [
    ...sessionChecks(legacy, policy),
    ...organizationIds(legacy, policy).flatMap((orgId) =>
      organizationChecks(legacy, policy, orgId),
    ),
    ...projectIds(legacy, policy).flatMap((projectId) =>
      projectChecks(legacy, policy, projectId),
    ),
  ].flatMap(toDiff);
}

/** sessionChecks compares the argument-free accessors. */
function sessionChecks(legacy: Session, policy: PolicySession): Check[] {
  return sessionHelpers.map(([helper, legacyHelper, policyHelper]) =>
    check(
      helper,
      {},
      {},
      () => legacyHelper(legacy),
      () => policyHelper(policy),
    ),
  );
}

/** organizationChecks compares every helper that takes an organization id. */
function organizationChecks(
  legacy: Session,
  policy: PolicySession,
  orgId: string,
): Check[] {
  const ids = { org_id: orgId };
  const org = OrganizationId(orgId);
  return [
    check(
      "findSessionOrganization",
      {},
      ids,
      () =>
        withoutRoles(legacyAccessors.findSessionOrganization(legacy, orgId)),
      () => policyAccessors.findSessionOrganization(policy, orgId),
    ),
    check(
      "getSessionOrganizationRole",
      {},
      ids,
      () => legacyAccessors.getSessionOrganizationRole(legacy, orgId),
      () => policyAccessors.getSessionOrganizationRole(policy, orgId),
    ),
    check(
      "rolesFor",
      { resource: "organization" },
      ids,
      () =>
        legacyRoleIds(
          legacyAccessors.getSessionOrganizationRole(legacy, orgId),
        ),
      () => policyRoleIds(policy, org, org),
    ),
    check(
      "getSessionPlan",
      { target: "organization" },
      ids,
      () => legacyGetSessionPlan(legacy, target({ organizationId: orgId })),
      () => getSessionPlan(policy, target({ organizationId: orgId })),
    ),
    ...organizationScopes.map((scope) =>
      check(
        "hasOrganizationAccess",
        { scope },
        ids,
        () =>
          legacyHasOrganizationAccess({
            session: legacy,
            organizationId: orgId,
            scope,
          }),
        () =>
          hasOrganizationAccess({
            session: policy,
            organizationId: orgId,
            scope,
          }),
      ),
    ),
    ...entitlementChecks(legacy, policy, { orgId }, ids),
  ];
}

/** projectChecks compares every helper that takes a project id. */
function projectChecks(
  legacy: Session,
  policy: PolicySession,
  projectId: string,
): Check[] {
  const ids = { project_id: projectId };
  return [
    check(
      "findSessionProject",
      {},
      ids,
      () =>
        maybeWithoutRole(legacyAccessors.findSessionProject(legacy, projectId)),
      () => policyAccessors.findSessionProject(policy, projectId),
    ),
    check(
      "findSessionProjectOrganization",
      {},
      ids,
      () =>
        withoutRoles(
          legacyAccessors.findSessionProjectOrganization(legacy, projectId),
        ),
      () => policyAccessors.findSessionProjectOrganization(policy, projectId),
    ),
    check(
      "getSessionProjectRole",
      {},
      ids,
      () => legacyAccessors.getSessionProjectRole(legacy, projectId),
      () => policyAccessors.getSessionProjectRole(policy, projectId),
    ),
    check(
      "rolesFor",
      { resource: "project" },
      ids,
      () =>
        legacyRoleIds(legacyAccessors.getSessionProjectRole(legacy, projectId)),
      () => projectRoleIds(legacy, policy, projectId),
    ),
    check(
      "getSessionPlan",
      { target: "project" },
      ids,
      () => legacyGetSessionPlan(legacy, target({ projectId })),
      () => getSessionPlan(policy, target({ projectId })),
    ),
    check(
      "getInAppAgentApiAccessScope",
      {},
      ids,
      () => legacyGetInAppAgentApiAccessScope(legacy, projectId),
      () => getInAppAgentApiAccessScope(policy, projectId),
    ),
    ...projectScopes.map((scope) =>
      check(
        "hasProjectAccess",
        { scope },
        ids,
        () => legacyHasProjectAccess({ session: legacy, projectId, scope }),
        () => hasProjectAccess({ session: policy, projectId, scope }),
      ),
    ),
    ...entitlementChecks(legacy, policy, { projectId }, ids),
  ];
}

/** entitlementChecks compares every entitlement and limit on an organization or project target. */
function entitlementChecks(
  legacy: Session,
  policy: PolicySession,
  on: { orgId: string } | { projectId: string },
  ids: Record<string, string>,
): Check[] {
  const targetTag = targetKind(on);
  return [
    ...allEntitlements.map((entitlement) =>
      check(
        "hasEntitlement",
        { entitlement, target: targetTag },
        ids,
        () => legacyHasEntitlement({ entitlement, session: legacy, ...on }),
        () => hasEntitlement({ entitlement, session: policy, ...on }),
      ),
    ),
    ...allEntitlementLimits.map((entitlementLimit) =>
      check(
        "hasEntitlementLimit",
        { limit: entitlementLimit, target: targetTag },
        ids,
        () =>
          legacyHasEntitlementLimit({
            entitlementLimit,
            session: legacy,
            ...on,
          }),
        () => hasEntitlementLimit({ entitlementLimit, session: policy, ...on }),
      ),
    ),
  ];
}

/** organizationIds is every organization either session lists. */
function organizationIds(legacy: Session, policy: PolicySession): string[] {
  return unionIds(
    legacyAccessors.getSessionOrganizations(legacy),
    policyAccessors.getSessionOrganizations(policy),
  );
}

/** projectIds is every project either session lists. */
function projectIds(legacy: Session, policy: PolicySession): string[] {
  return unionIds(
    legacyAccessors.getSessionProjects(legacy),
    policyAccessors.getSessionProjects(policy),
  );
}

/** unionIds lists each id of either list once. */
function unionIds(a: { id: string }[], b: { id: string }[]): string[] {
  return [...new Set([...a, ...b].map((item) => item.id))];
}

/** legacyRoleIds is the legacy role as the role ids rolesFor would list. */
function legacyRoleIds(role: Role | undefined): string[] {
  if (!role) return [];
  return [SystemRoleId(role)];
}

/** projectRoleIds is rolesFor on a project, in the tenant either session places it in. */
function projectRoleIds(
  legacy: Session,
  policy: PolicySession,
  projectId: string,
): string[] {
  const org =
    policyAccessors.findPrincipalProjectOrganization(policy, projectId) ??
    legacyAccessors.findSessionProjectOrganization(legacy, projectId);
  if (!org) return [];
  return policyRoleIds(policy, OrganizationId(org.id), ProjectId(projectId));
}

/** policyRoleIds is rolesFor on the policy-engine session, sorted. */
function policyRoleIds(
  policy: PolicySession,
  tenant: OrganizationId,
  resource: ResourceId,
): string[] {
  if (!policy.authCtx) return [];
  return rolesFor(policy.authCtx, tenant, resource).sort();
}

/** target names a page by organization or project for getSessionPlan. */
function target(
  on: { organizationId: string } | { projectId: string },
): Parameters<typeof getSessionPlan>[1] {
  return { organizationId: undefined, projectId: undefined, ...on };
}

/** targetKind tags whether an entitlement target is an organization or a project. */
function targetKind(on: { orgId: string } | { projectId: string }): string {
  if ("orgId" in on) return "organization";
  return "project";
}

/** withoutRoles drops the role the legacy session tree carries at runtime on an organization and its projects. */
function withoutRoles(
  org: legacyAccessors.SessionOrganization | undefined,
): legacyAccessors.SessionOrganization | undefined {
  if (!org) return undefined;
  const { projects, ...rest } = withoutRole(org);
  return { ...rest, projects: projects.map(withoutRole) };
}

/** withoutRole drops the role the legacy session tree carries at runtime on a node. */
function withoutRole<T extends object>(node: T): T {
  const { role: _role, ...rest } = node as T & { role?: unknown };
  return rest as T;
}

/** maybeWithoutRole drops the role from a node that may be missing. */
function maybeWithoutRole<T extends object>(
  node: T | undefined,
): T | undefined {
  if (!node) return undefined;
  return withoutRole(node);
}

/** byId orders a list by id so lists compare regardless of order. */
function byId<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

/** check runs one helper call on both sessions, capturing a thrown error as its result. */
function check(
  helper: string,
  tags: Record<string, string>,
  ids: Record<string, string>,
  legacy: () => unknown,
  policy: () => unknown,
): Check {
  return {
    helper,
    tags,
    ids,
    legacy: outcome(legacy),
    policy: outcome(policy),
  };
}

/** outcome is a call's return value, or the name of the error it threw. */
function outcome(call: () => unknown): unknown {
  try {
    return call();
  } catch (error) {
    return { threw: errorName(error) };
  }
}

/** errorName is a thrown value's error class name. */
function errorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  return typeof error;
}

/** toDiff reports a check whose results differ, classifying boolean disagreements by which side allows. */
function toDiff(c: Check): SessionDiff[] {
  if (canonical(c.legacy) === canonical(c.policy)) return [];
  return [
    {
      helper: c.helper,
      result: classify(c.legacy, c.policy),
      tags: c.tags,
      ids: c.ids,
    },
  ];
}

/** classify names which side allows a boolean disagreement, and any other difference a mismatch. */
function classify(legacy: unknown, policy: unknown): SessionDiff["result"] {
  if (typeof legacy !== "boolean" || typeof policy !== "boolean") {
    return "mismatch";
  }
  if (policy) return "new_allows";
  return "new_denies";
}

/** canonical serializes a value with sorted object keys, dropping undefined fields. */
function canonical(value: unknown): string {
  return JSON.stringify(value, sortedKeys) ?? "undefined";
}

/** sortedKeys is a JSON replacer that orders each object's keys. */
function sortedKeys(_key: string, value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** isPlainObject reports whether value is a non-array object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** HelperPair is an argument-free accessor's name with its legacy and policy-engine version. */
type HelperPair = [
  string,
  (session: Session) => unknown,
  (session: PolicySession) => unknown,
];

/** Check is one helper call's legacy and policy-engine results with its argument tags and identifiers. */
type Check = {
  helper: string;
  tags: Record<string, string>;
  ids: Record<string, string>;
  legacy: unknown;
  policy: unknown;
};

/** ShadowSessionDeps are the throttle, session builder and telemetry a shadow run uses. */
type ShadowSessionDeps = {
  setIfAbsent: (key: string, ttlSeconds: number) => Promise<boolean>;
  buildSession: (token: JWT, session: Session) => Promise<PolicySession>;
  telemetry: Telemetry;
  histogram: (stat: string, value: number) => void;
};
