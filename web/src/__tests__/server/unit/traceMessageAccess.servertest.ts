import { describe, expect, it } from "vitest";
import { type Session } from "next-auth";
import { TRPCError } from "@trpc/server";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";

import {
  canSessionReadTraceMessages,
  enforceTraceMessageSearchAndFilterAccess,
  hasIoFilterColumn,
} from "@/src/features/traces/server/traceMessageAccess";

const makeSession = (
  projectRole: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "VIEWER_METADATA",
  projectId = "proj-1",
): Session => {
  const tenantId = OrganizationId("org-1");
  const roleId = SystemRoleId(projectRole);
  const definition = systemRoleAccessRights[projectRole];
  const policies = [
    definition.policies.map((policy) => ({
      id: `${roleId}:${policy.resourceKind}`,
      roleId,
      tenantId,
      effect: policy.effect,
      actions: policy.actions,
      resources:
        policy.resourceKind === "organization"
          ? [tenantId]
          : [ProjectId(projectId)],
    })),
  ];

  return {
    policies,
    user: {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      admin: false,
      organizations: [
        {
          id: "org-1",
          name: "Org",
          role: projectRole,
          plan: "oss",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          projects: [
            {
              id: projectId,
              name: "Project",
              role: projectRole,
              deletedAt: null,
              retentionDays: null,
              metadata: {},
            },
          ],
        },
      ],
    },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  } as unknown as Session;
};

describe("traceMessageAccess", () => {
  it("allows VIEWER and blocks VIEWER_METADATA from reading trace messages", () => {
    expect(
      canSessionReadTraceMessages({
        session: makeSession("VIEWER"),
        projectId: "proj-1",
      }),
    ).toBe(true);

    expect(
      canSessionReadTraceMessages({
        session: makeSession("VIEWER_METADATA"),
        projectId: "proj-1",
      }),
    ).toBe(false);

    // Public flag does not override an authenticated member's project role
    expect(
      canSessionReadTraceMessages({
        session: makeSession("VIEWER_METADATA"),
        projectId: "proj-1",
        isPublic: true,
      }),
    ).toBe(false);

    // Unauthenticated visitors may view public traces only
    expect(
      canSessionReadTraceMessages({
        session: null,
        projectId: "proj-1",
        isPublic: true,
      }),
    ).toBe(true);
    expect(
      canSessionReadTraceMessages({
        session: null,
        projectId: "proj-1",
        isPublic: false,
      }),
    ).toBe(false);
  });

  it("detects IO filter columns case-insensitively", () => {
    expect(hasIoFilterColumn([{ column: "input" }])).toBe(true);
    expect(hasIoFilterColumn([{ column: "Output" }])).toBe(true);
    expect(
      hasIoFilterColumn([{ column: "metadata" }, { column: "name" }]),
    ).toBe(false);
  });

  it("rejects IO filters and strips IO search types when restricted", () => {
    expect(() =>
      enforceTraceMessageSearchAndFilterAccess({
        canReadMessages: false,
        filter: [{ column: "input" }],
        searchType: ["id"],
      }),
    ).toThrow(TRPCError);

    expect(
      enforceTraceMessageSearchAndFilterAccess({
        canReadMessages: false,
        searchQuery: "secret",
        searchType: ["id", "content"],
        filter: [{ column: "name" }],
      }),
    ).toEqual({
      searchQuery: "secret",
      searchType: ["id"],
      filter: [{ column: "name" }],
    });

    expect(
      enforceTraceMessageSearchAndFilterAccess({
        canReadMessages: false,
        searchQuery: "secret",
        searchType: ["content", "input", "output"],
        filter: [],
      }),
    ).toEqual({
      searchQuery: undefined,
      searchType: ["id"],
      filter: [],
    });

    expect(
      enforceTraceMessageSearchAndFilterAccess({
        canReadMessages: true,
        searchQuery: "secret",
        searchType: ["content", "input"],
        filter: [{ column: "input" }],
      }),
    ).toEqual({
      searchQuery: "secret",
      searchType: ["content", "input"],
      filter: [{ column: "input" }],
    });
  });
});
