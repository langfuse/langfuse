import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

const buildSession = (orgId: string, projectId: string): Session =>
  createSession({
    user: {
      featureFlags: {
        templateFlag: true,
        v4BetaToggleVisible: false,
        experimentsV4Enabled: false,
        langfuseTopics: false,
      },
    },
    organizations: [
      {
        id: orgId,
        role: "OWNER",
        projects: [{ id: projectId, role: "ADMIN", retentionDays: null }],
      },
    ],
  });

describe("missing-record deletes map to NOT_FOUND", () => {
  let projectId: string;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(async () => {
    const setup = await createOrgProjectAndApiKey();
    projectId = setup.projectId;
    const ctx = createInnerTRPCContext({
      session: buildSession(setup.orgId, setup.projectId),
      headers: {},
    });
    caller = appRouter.createCaller({ ...ctx, prisma });
  });

  it("returns NOT_FOUND when deleting a model that is already gone", async () => {
    await expect(
      caller.models.delete({
        projectId,
        modelId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when deleting an LLM API key that is already gone", async () => {
    await expect(
      caller.llmApiKey.delete({
        projectId,
        id: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when deleting a default eval model that is already gone", async () => {
    await expect(
      caller.defaultLlmModel.deleteDefaultModel({ projectId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
