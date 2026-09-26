import { projectRoleAccessRights } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { organizationRoleAccessRights } from "@/src/features/rbac/constants/organizationAccessRights";
import { systemRoleAccessRights } from "@/src/features/rbac/constants/systemRoleAccessRights";
import {
  allOrganizationActions,
  allProjectActions,
  type ProjectAction,
} from "@/src/features/rbac/types";

// The project-administration actions an ORGANIZATION key reserves and a
// PROJECT key does not hold.
const orgReservedProjectActions: ProjectAction[] = [
  "apiKeys:read",
  "apiKeys:CUD",
  "projectMembers:read",
  "projectMembers:CUD",
  "project:update",
  "project:delete",
];

describe("systemRoleAccessRights", () => {
  // Decision-equivalence guard: these api-key policies pin the exact action
  // sets a later ticket depends on staying equal.
  it("grants a PROJECT key every project action except the org-reserved admin actions", () => {
    expect(systemRoleAccessRights.PROJECT.policies).toEqual([
      {
        resourceKind: "project",
        effect: "ALLOW",
        actions: allProjectActions.filter(
          (action) => !orgReservedProjectActions.includes(action),
        ),
      },
    ]);
  });

  it("grants an ORGANIZATION key the full org vocab plus project administration", () => {
    expect(systemRoleAccessRights.ORGANIZATION.policies).toEqual([
      {
        resourceKind: "organization",
        effect: "ALLOW",
        actions: allOrganizationActions,
      },
      {
        resourceKind: "project",
        effect: "ALLOW",
        actions: [
          "project:read",
          "apiKeys:read",
          "apiKeys:CUD",
          "projectMembers:read",
          "projectMembers:CUD",
          "project:update",
          "project:delete",
        ],
      },
    ]);
  });

  it("grants SCORES_INGEST exactly scores:create at project scope", () => {
    expect(systemRoleAccessRights.SCORES_INGEST.policies).toEqual([
      {
        resourceKind: "project",
        effect: "ALLOW",
        actions: ["scores:create"],
      },
    ]);
  });

  it("grants INGEST exactly the ingestion project actions", () => {
    expect(systemRoleAccessRights.INGEST.policies).toEqual([
      {
        resourceKind: "project",
        effect: "ALLOW",
        actions: ["traces:create", "scores:create", "media:create"],
      },
    ]);
  });

  it("grants LLM_GATEWAY exactly gateway:invoke at org scope", () => {
    expect(systemRoleAccessRights.LLM_GATEWAY.policies).toEqual([
      {
        resourceKind: "organization",
        effect: "ALLOW",
        actions: ["gateway:invoke"],
      },
    ]);
  });

  it.each(["OWNER", "ADMIN", "MEMBER", "VIEWER", "NONE"] as const)(
    "derives %s policies from the org and project access-right tables",
    (role) => {
      expect(systemRoleAccessRights[role].policies).toEqual([
        {
          resourceKind: "organization",
          effect: "ALLOW",
          actions: organizationRoleAccessRights[role],
        },
        {
          resourceKind: "project",
          effect: "ALLOW",
          actions: projectRoleAccessRights[role],
        },
      ]);
    },
  );

  it("keys every definition by its own id", () => {
    for (const [key, definition] of Object.entries(systemRoleAccessRights)) {
      expect(definition.id).toBe(key);
    }
  });

  it("tags api-key roles and user roles disjointly", () => {
    const tagsFor = (role: keyof typeof systemRoleAccessRights) =>
      systemRoleAccessRights[role].tags;
    for (const role of [
      "PROJECT",
      "ORGANIZATION",
      "SCORES_INGEST",
      "INGEST",
      "LLM_GATEWAY",
    ] as const) {
      expect(tagsFor(role)).toEqual(["principal:apiKey"]);
    }
    for (const role of [
      "OWNER",
      "ADMIN",
      "MEMBER",
      "VIEWER",
      "NONE",
    ] as const) {
      expect(tagsFor(role)).toEqual(["principal:user"]);
    }
  });
});
