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
      organizations: [
        {
          id: "seed-org-id",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          projects: [
            {
              id: projectId,
              role: "ADMIN",
            },
          ],
        },
      ],
      featureFlags: {
        templateFlag: true,
      },
      admin: true,
    },
    environment: {} as any,
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

  describe("llmApiKey.update", () => {
    it("should update only metadata without touching credentials", async () => {
      // Create an LLM API key first
      const secret = "sk-test-original-key";
      const originalProvider = "OpenAI Original";
      
      await caller.llmApiKey.create({
        projectId,
        secretKey: secret,
        provider: originalProvider,
        adapter: LLMAdapter.OpenAI,
        baseURL: "https://api.openai.com/v1",
        withDefaultModels: true,
        customModels: ["gpt-3.5-turbo"],
        extraHeaders: { "X-Test": "original" },
      });

      const apiKey = await prisma.llmApiKeys.findFirst({
        where: { projectId, provider: originalProvider },
      });
      expect(apiKey).toBeTruthy();

      // Update only metadata
      const result = await caller.llmApiKey.update({
        id: apiKey!.id,
        projectId,
        lastKnownUpdate: apiKey!.updatedAt,
        provider: "OpenAI Updated",
        baseURL: "https://api.openai.com/v2",
        withDefaultModels: false,
        customModels: ["gpt-4", "gpt-4-turbo"],
      });

      expect(result.success).toBe(true);

      // Verify the update
      const updated = await prisma.llmApiKeys.findUnique({
        where: { id: apiKey!.id },
      });

      expect(updated).toBeTruthy();
      expect(updated!.provider).toBe("OpenAI Updated");
      expect(updated!.baseURL).toBe("https://api.openai.com/v2");
      expect(updated!.withDefaultModels).toBe(false);
      expect(updated!.customModels).toEqual(["gpt-4", "gpt-4-turbo"]);
      
      // Credentials should remain unchanged
      expect(updated!.secretKey).toBe(apiKey!.secretKey);
      expect(updated!.displaySecretKey).toBe(apiKey!.displaySecretKey);
      expect(updated!.extraHeaders).toBe(apiKey!.extraHeaders);
      expect(updated!.extraHeaderKeys).toEqual(apiKey!.extraHeaderKeys);
    });

    it("should update API credentials and verify encryption", async () => {
      // Create an LLM API key first
      const originalSecret = "sk-test-original";
      const provider = "OpenAI Test";
      
      await caller.llmApiKey.create({
        projectId,
        secretKey: originalSecret,
        provider,
        adapter: LLMAdapter.OpenAI,
        withDefaultModels: true,
        customModels: [],
      });

      const apiKey = await prisma.llmApiKeys.findFirst({
        where: { projectId, provider },
      });
      expect(apiKey).toBeTruthy();

      const newSecretKey = "sk-test-updated-key";

      // Update with new credentials
      const result = await caller.llmApiKey.update({
        id: apiKey!.id,
        projectId,
        lastKnownUpdate: apiKey!.updatedAt,
        secretKey: newSecretKey,
        extraHeaders: { "Authorization": "Bearer new-token" },
      });

      expect(result.success).toBe(true);

      // Verify the update
      const updated = await prisma.llmApiKeys.findUnique({
        where: { id: apiKey!.id },
      });

      expect(updated).toBeTruthy();
      
      // Secret key should be encrypted and display key updated
      expect(updated!.secretKey).not.toBe(newSecretKey);
      expect(updated!.secretKey).not.toBe(apiKey!.secretKey);
      expect(updated!.displaySecretKey).toBe("...t-key");
      
      // Extra headers should be encrypted
      expect(updated!.extraHeaders).toBeTruthy();
      expect(updated!.extraHeaders).not.toContain("Bearer new-token");
      expect(updated!.extraHeaderKeys).toEqual(["Authorization"]);
    });

    it("should fail with concurrent update protection", async () => {
      // Create an LLM API key
      const secret = "sk-test-concurrent";
      const provider = "OpenAI Concurrent";
      
      await caller.llmApiKey.create({
        projectId,
        secretKey: secret,
        provider,
        adapter: LLMAdapter.OpenAI,
        withDefaultModels: true,
        customModels: [],
      });

      const apiKey = await prisma.llmApiKeys.findFirst({
        where: { projectId, provider },
      });
      expect(apiKey).toBeTruthy();

      // Simulate another user updating the key
      await prisma.llmApiKeys.update({
        where: { id: apiKey!.id },
        data: { provider: "Updated by another user" },
      });

      // Try to update with stale timestamp
      await expect(
        caller.llmApiKey.update({
          id: apiKey!.id,
          projectId,
          lastKnownUpdate: apiKey!.updatedAt, // This is now stale
          provider: "My update",
        })
      ).rejects.toThrow("recently modified by another user");
    });
  });
});
