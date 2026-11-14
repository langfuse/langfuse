import { type Session } from "next-auth";
import { type JWT } from "next-auth/jwt";
import { describe, expect, it, vi } from "vitest";

import { type Role } from "@langfuse/shared";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import {
  testPrincipalOrganization,
  testPrincipalProject,
  testPrincipalUser,
} from "@/src/__tests__/fixtures/principal";
import { type PolicySession } from "@/src/features/rbac/new/sessionCallback";
import { shadowSession } from "@/src/features/rbac/new/shadowSession";
import { type Policy } from "@/src/features/rbac/types";

const USER = "user_1";
const ORG = "org_1";
const PRJ = "prj_1";
const TENANT = OrganizationId(ORG);
const token = { sub: USER, loginAt: 0 } as JWT;
const environment = {
  enableExperimentalFeatures: false,
  selfHostedInstancePlan: null,
};
const featureFlags = testFeatureFlags();
const roleResources = {
  organization: TENANT,
  project: ProjectId("*"),
} as const;

const policiesFor = (role: Role): Policy[] =>
  systemRoleAccessRights[role].policies.map((p) => ({
    id: `system/${role}:${p.resourceKind}`,
    roleId: SystemRoleId(role),
    tenantId: TENANT,
    effect: p.effect,
    actions: p.actions,
    resources: [roleResources[p.resourceKind]],
  }));

const legacySession = (role: Role): Session => ({
  expires: "2099-01-01T00:00:00.000Z",
  environment,
  user: {
    id: USER,
    email: "user@example.com",
    name: "User",
    image: null,
    v4BetaEnabled: false,
    canToggleV4: false,
    v4UpgradeUiAvailable: false,
    canCreateOrganizations: true,
    hasPassword: false,
    featureFlags,
    organizations: [
      {
        id: ORG,
        name: "Org",
        role,
        supportAccess: false,
        cloudConfig: undefined,
        plan: "oss",
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: true,
        accessAuditLogEnabled: false,
        featureFlags,
        projects: [
          {
            id: PRJ,
            name: "Project",
            role,
            deletedAt: null,
            retentionDays: null,
            hasTraces: false,
            topicsEnabled: false,
            scoreEditsDisabled: false,
            forceV3Experience: false,
            metadata: {},
            createdAt: "2026-09-16T00:00:00.000Z",
          },
        ],
      },
    ],
  },
});

const policySession = (role: Role): PolicySession => ({
  environment,
  authCtx: {
    principal: {
      kind: "user",
      user: testPrincipalUser({ id: USER }),
      organizations: [
        testPrincipalOrganization({
          id: ORG,
          projects: [testPrincipalProject({ id: PRJ })],
        }),
      ],
    },
    policies: [policiesFor(role)],
  },
});

const fakeDeps = (buildSession: () => Promise<PolicySession>) => {
  const seen = new Set<string>();
  const increments: { stat: string; tags: Record<string, string | number> }[] =
    [];
  return {
    increments,
    deps: {
      setIfAbsent: async (key: string) => {
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      },
      buildSession: vi.fn(buildSession),
      telemetry: {
        increment: (stat: string, tags: Record<string, string | number>) =>
          increments.push({ stat, tags }),
        span: () => undefined,
      },
      histogram: () => undefined,
    },
  };
};

describe("shadowSession", () => {
  it("reports only the role-dependent helpers when the roles disagree", async () => {
    const { deps, increments } = fakeDeps(async () => policySession("MEMBER"));

    await shadowSession(token, legacySession("VIEWER"), deps);

    const helpers = new Set(increments.map(({ tags }) => tags.helper));
    expect(helpers).toContain("getSessionOrganizationRole");
    expect(
      [...helpers].filter(
        (helper) =>
          ![
            "getSessionOrganizationRole",
            "getSessionProjectRole",
            "rolesFor",
            "hasOrganizationAccess",
            "hasProjectAccess",
          ].includes(String(helper)),
      ),
    ).toEqual([]);
    expect(increments).toContainEqual({
      stat: "langfuse.authz.parity",
      tags: expect.objectContaining({
        surface: "session",
        helper: "hasProjectAccess",
        scope: "prompts:CUD",
        result: "new_allows",
      }),
    });
  });

  it("compares a user and role fingerprint once", async () => {
    const { deps } = fakeDeps(async () => policySession("MEMBER"));

    await shadowSession(token, legacySession("MEMBER"), deps);
    await shadowSession(token, legacySession("MEMBER"), deps);

    expect(deps.buildSession).toHaveBeenCalledTimes(1);
  });

  it("never throws when the policy-engine session fails", async () => {
    const { deps, increments } = fakeDeps(async () => {
      throw new Error("database unavailable");
    });

    await expect(
      shadowSession(token, legacySession("MEMBER"), deps),
    ).resolves.toBeUndefined();
    expect(increments.map(({ stat }) => stat)).toEqual([
      "langfuse.authz.shadow_session.error",
    ]);
  });
});
