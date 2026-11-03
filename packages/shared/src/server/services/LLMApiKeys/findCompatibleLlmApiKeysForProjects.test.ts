import { type LlmApiKeys, type Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { findCompatibleLlmApiKeysForProjects } from "./findCompatibleLlmApiKeysForProjects";

const connection = (
  id: string,
  owner: { projectId?: string; organizationId?: string },
) =>
  ({
    id,
    projectId: owner.projectId ?? null,
    organizationId: owner.organizationId ?? null,
  }) as LlmApiKeys;

describe("findCompatibleLlmApiKeysForProjects", () => {
  it("prefers a project connection over its organization connection", async () => {
    const tx = {
      project: {
        findMany: vi.fn().mockResolvedValue([
          { id: "project", orgId: "organization" },
          { id: "inherited-project", orgId: "organization" },
        ]),
      },
      llmApiKeys: {
        findMany: vi.fn().mockResolvedValue([
          connection("organization-key", {
            organizationId: "organization",
          }),
          connection("project-key", { projectId: "project" }),
        ]),
      },
    } as unknown as Prisma.TransactionClient;

    const replacements = await findCompatibleLlmApiKeysForProjects({
      tx,
      projectIds: ["project", "inherited-project"],
      provider: "shared-name",
      adapter: "openai",
      excludedLlmApiKeyId: "deleted-key",
    });

    expect(replacements.get("project")?.id).toBe("project-key");
    expect(replacements.get("inherited-project")?.id).toBe("organization-key");
    expect(tx.llmApiKeys.findMany).toHaveBeenCalledWith({
      where: {
        provider: "shared-name",
        adapter: "openai",
        id: { not: "deleted-key" },
        OR: [
          { projectId: { in: ["project", "inherited-project"] } },
          { organizationId: { in: ["organization"] } },
        ],
      },
    });
  });
});
