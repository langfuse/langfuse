import { projectRoleAccessRights } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { apiKeyAccessRights } from "@/src/features/rbac/constants/apiKeyAccessRights";
import { organizationRoleAccessRights } from "@/src/features/rbac/constants/organizationAccessRights";
import { systemRoleAccessRights } from "@/src/features/rbac/constants/systemRoleAccessRights";

describe("systemRoleAccessRights", () => {
  // Decision-equivalence guard: a later ticket depends on these staying equal.
  it.each(["PROJECT", "ORGANIZATION", "SCORES_INGEST"] as const)(
    "keeps %s byte-for-byte equal to apiKeyAccessRights",
    (role) => {
      expect(systemRoleAccessRights[role]).toEqual(apiKeyAccessRights[role]);
    },
  );

  it("grants INGEST exactly the ingestion project actions", () => {
    expect(systemRoleAccessRights.INGEST).toEqual([
      {
        kind: "project",
        source: { kind: "role", id: "INGEST" },
        effect: "allow",
        actions: ["traces:create", "scores:create", "media:create"],
      },
    ]);
  });

  it("grants LLM_GATEWAY exactly gateway:invoke at org scope", () => {
    expect(systemRoleAccessRights.LLM_GATEWAY).toEqual([
      {
        kind: "organization",
        source: { kind: "role", id: "LLM_GATEWAY" },
        effect: "allow",
        actions: ["gateway:invoke"],
      },
    ]);
  });

  it.each(["OWNER", "ADMIN", "MEMBER", "VIEWER", "NONE"] as const)(
    "derives %s policies from the org and project access-right tables",
    (role) => {
      expect(systemRoleAccessRights[role]).toEqual([
        {
          kind: "organization",
          source: { kind: "role", id: role },
          effect: "allow",
          actions: organizationRoleAccessRights[role],
        },
        {
          kind: "project",
          source: { kind: "role", id: role },
          effect: "allow",
          actions: projectRoleAccessRights[role],
        },
      ]);
    },
  );
});
