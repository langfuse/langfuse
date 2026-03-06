/** @jest-environment node */

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  LLMAdapter,
} from "@langfuse/shared/src/server";
import { encrypt } from "@langfuse/shared/encryption";
import type { Session } from "next-auth";

const __orgIds: string[] = [];

async function prepare() {
  const { project, org } = await createOrgProjectAndApiKey();

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

  const ctx = createInnerTRPCContext({ session });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  __orgIds.push(org.id);

  return { project, caller };
}

describe("llmApiKey tRPC", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: __orgIds },
      },
    });
  });

  it("all returns key status and statusMessage", async () => {
    const { project, caller } = await prepare();

    const key = await prisma.llmApiKeys.create({
      data: {
        projectId: project.id,
        provider: "openai-test",
        adapter: LLMAdapter.OpenAI,
        secretKey: encrypt("sk-test"),
        displaySecretKey: "...test",
        status: "ERROR",
        statusMessage: "Connection failed",
      },
    });

    const response = await caller.llmApiKey.all({
      projectId: project.id,
    });

    const found = response.data.find((item) => item.id === key.id);
    expect(found?.status).toBe("ERROR");
    expect(found?.statusMessage).toBe("Connection failed");
  });

  it("update clears key status and statusMessage", async () => {
    const { project, caller } = await prepare();

    const key = await prisma.llmApiKeys.create({
      data: {
        projectId: project.id,
        provider: "openai-update",
        adapter: LLMAdapter.OpenAI,
        secretKey: encrypt("sk-test"),
        displaySecretKey: "...test",
        status: "ERROR",
        statusMessage: "Connection failed",
      },
    });

    await caller.llmApiKey.update({
      projectId: project.id,
      id: key.id,
      provider: "openai-update",
      adapter: LLMAdapter.OpenAI,
      withDefaultModels: true,
      customModels: [],
    });

    const updated = await prisma.llmApiKeys.findUnique({
      where: { id: key.id },
    });

    expect(updated?.status).toBe("OK");
    expect(updated?.statusMessage).toBeNull();
  });

  it("deleting the default-model key deactivates dependent configs with a config message", async () => {
    const { project, caller } = await prepare();

    const key = await prisma.llmApiKeys.create({
      data: {
        projectId: project.id,
        provider: "openai-default",
        adapter: LLMAdapter.OpenAI,
        secretKey: encrypt("sk-test"),
        displaySecretKey: "...test",
      },
    });

    await prisma.defaultLlmModel.create({
      data: {
        projectId: project.id,
        llmApiKeyId: key.id,
        provider: "openai-default",
        adapter: LLMAdapter.OpenAI,
        model: "gpt-4o-mini",
      },
    });

    const template = await prisma.evalTemplate.create({
      data: {
        projectId: project.id,
        name: "default-template",
        version: 1,
        prompt: "Evaluate",
        provider: null,
        model: null,
        vars: [],
        outputSchema: { score: "number" },
      },
    });

    const config = await prisma.jobConfiguration.create({
      data: {
        projectId: project.id,
        jobType: "EVAL",
        scoreName: "default-score",
        filter: [],
        targetObject: "trace",
        variableMapping: [],
        sampling: 1,
        delay: 0,
        status: "ACTIVE",
        evalTemplateId: template.id,
      },
    });

    await caller.llmApiKey.delete({
      projectId: project.id,
      id: key.id,
    });

    const updatedConfig = await prisma.jobConfiguration.findUnique({
      where: { id: config.id },
    });

    expect(updatedConfig?.status).toBe("INACTIVE");
    expect(updatedConfig?.statusMessage).toContain(
      "shared default evaluation model connection was removed",
    );
  });
});
