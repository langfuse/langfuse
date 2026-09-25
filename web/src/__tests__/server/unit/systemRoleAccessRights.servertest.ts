import { projectRoleAccessRights } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { apiKeyAccessRights } from "@/src/features/rbac/constants/apiKeyAccessRights";
import { organizationRoleAccessRights } from "@/src/features/rbac/constants/organizationAccessRights";
import { systemRoleAccessRights } from "@/src/features/rbac/constants/systemRoleAccessRights";

describe("systemRoleAccessRights", () => {
  // Decision-equivalence guard: a later ticket depends on these staying equal.
  it.each(["PROJECT", "ORGANIZATION", "SCORES_INGEST"] as const)(
    "keeps %s policies byte-for-byte equal to apiKeyAccessRights",
    (role) => {
      expect(systemRoleAccessRights[role].policies).toEqual(
        apiKeyAccessRights[role],
      );
    },
  );

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
