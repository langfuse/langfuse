/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { Session } from "next-auth";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { LLMAdapter } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

describe("llmApiKey.all RPC", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  beforeEach(async () => await pruneDatabase());

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      name: "Demo User",
      projects: [
        {
          id: projectId,
          role: "ADMIN",
          name: "test",
        },
      ],
      featureFlags: {
        templateFlag: true,
        evals: true,
      },
      admin: true,
    },
  };

  const ctx = createInnerTRPCContext({ session });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  it("should create an llm api key", async () => {
    const secret = "test-secret";
    const provider = "openai";
    const adapter = LLMAdapter.OpenAI;
    const customModels = ["fancy-gpt-3.5-turbo"];
    const baseURL = "https://custom.openai.com/v1";
    const withDefaultModels = false;

    await caller.llmApiKey.create({
      projectId,
      secretKey: secret,
      provider,
      adapter,
      baseURL,
      customModels,
      withDefaultModels,
    });

    const llmApiKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId,
      },
    });

    expect(llmApiKeys.length).toBe(1);
    expect(llmApiKeys[0].projectId).toBe(projectId);
    expect(llmApiKeys[0].secretKey).not.toBeNull();
    expect(llmApiKeys[0].secretKey).not.toEqual(secret);
    expect(llmApiKeys[0].provider).toBe(provider);
    expect(llmApiKeys[0].adapter).toBe(adapter);
    expect(llmApiKeys[0].baseURL).toBe(baseURL);
    expect(llmApiKeys[0].customModels).toEqual(customModels);
    expect(llmApiKeys[0].withDefaultModels).toBe(withDefaultModels);
    // this has to be 3 dots and the last 4 characters of the secret
    expect(llmApiKeys[0].displaySecretKey).toMatch(/^...[a-zA-Z0-9]{4}$/);
  });

  it("should create and get an llm api key", async () => {
    const secret = "test-secret";
    const provider = "openai";
    const adapter = LLMAdapter.OpenAI;
    const customModels = ["fancy-gpt-3.5-turbo"];
    const baseURL = "https://custom.openai.com/v1";
    const withDefaultModels = false;

    await caller.llmApiKey.create({
      projectId,
      secretKey: secret,
      provider,
      adapter,
      baseURL,
      customModels,
      withDefaultModels,
    });

    const dbLlmApiKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId,
      },
    });

    expect(dbLlmApiKeys.length).toBe(1);

    const { data: llmApiKeys } = await caller.llmApiKey.all({
      projectId,
    });

    expect(llmApiKeys.length).toBe(1);
    expect(llmApiKeys[0].projectId).toBe(projectId);
    expect(llmApiKeys[0].secretKey).not.toBeNull();
    expect(llmApiKeys[0].secretKey).not.toEqual(secret);
    expect(llmApiKeys[0].provider).toBe(provider);
    expect(llmApiKeys[0].adapter).toBe(adapter);
    expect(llmApiKeys[0].baseURL).toBe(baseURL);
    expect(llmApiKeys[0].customModels).toEqual(customModels);
    expect(llmApiKeys[0].withDefaultModels).toBe(withDefaultModels);
    // this has to be 3 dots and the last 4 characters of the secret
    expect(llmApiKeys[0].displaySecretKey).toMatch(/^...[a-zA-Z0-9]{4}$/);

    // response must not contain the secret key itself
    expect(llmApiKeys[0]).not.toHaveProperty("secretKey");
  });
});
