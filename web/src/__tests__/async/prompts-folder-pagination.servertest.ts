/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { disconnectQueues } from "@/src/__tests__/test-utils";
import { v4 } from "uuid";

async function prepare() {
  const { org, project } = await createOrgProjectAndApiKey();

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  return { project, caller };
}

describe("prompts folder pagination", () => {
  afterAll(async () => {
    await disconnectQueues();
  });

  it("only counts prompts in a folder and excludes nested", async () => {
    const { caller, project } = await prepare();

    await prisma.prompt.createMany({
      data: [
        {
          id: v4(),
          projectId: project.id,
          name: "folder/prompt1",
          prompt: "p1",
          version: 1,
          type: "text",
          createdBy: "tester",
        },
        {
          id: v4(),
          projectId: project.id,
          name: "folder/prompt2",
          prompt: "p2",
          version: 1,
          type: "text",
          createdBy: "tester",
        },
        {
          id: v4(),
          projectId: project.id,
          name: "folder/nested/prompt3",
          prompt: "p3",
          version: 1,
          type: "text",
          createdBy: "tester",
        },
        {
          id: v4(),
          projectId: project.id,
          name: "other/prompt4",
          prompt: "p4",
          version: 1,
          type: "text",
          createdBy: "tester",
        },
      ],
    });

    const response = await caller.prompts.all({
      projectId: project.id,
      filter: [],
      orderBy: { column: "createdAt", order: "DESC" },
      limit: 10,
      page: 0,
      pathPrefix: "folder",
    });

    expect(response.totalCount).toBe(2);
    const names = response.prompts.map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["folder/prompt1", "folder/prompt2"]),
    );
    expect(names).not.toContain("folder/nested/prompt3");
  });
});
