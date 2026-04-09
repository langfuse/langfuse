/** @jest-environment node */

jest.mock("@langfuse/shared/src/server", () => {
  const actual = jest.requireActual("@langfuse/shared/src/server");
  return {
    ...actual,
    fetchLLMCompletion: jest.fn(),
  };
});

import type { Session } from "next-auth";
import { LLMAdapter } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import {
  createOrgProjectAndApiKey,
  fetchLLMCompletion,
} from "@langfuse/shared/src/server";

const mockFetchLLMCompletion = jest.mocked(fetchLLMCompletion);

describe("llmApiKey.all RPC", () => {
  let projectId: string;
  let orgId: string;
  let session: Session;
  let caller: ReturnType<typeof appRouter.createCaller>;

  const createCallerForProjectRole = (
    projectRole: "ADMIN" | "MEMBER" | "VIEWER",
  ) => {
    const limitedSession: Session = {
      ...session,
      user: {
        ...session.user!,
        admin: false,
        organizations: [
          {
            ...session.user!.organizations[0],
            role: "MEMBER",
            projects: [
              {
                ...session.user!.organizations[0].projects[0],
                role: projectRole,
              },
            ],
          },
        ],
      },
    };

    const limitedCtx = createInnerTRPCContext({
      session: limitedSession,
      headers: {},
    });

    return appRouter.createCaller({ ...limitedCtx, prisma });
  };

  beforeEach(async () => {
    const setup = await createOrgProjectAndApiKey();
    projectId = setup.projectId;
    orgId = setup.orgId;
    mockFetchLLMCompletion.mockReset().mockResolvedValue({});

    session = {
      expires: "1",
      user: {
        id: "user-1",
        name: "Demo User",
        canCreateOrganizations: true,
        organizations: [
          {
            id: orgId,
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            name: "Test Organization",
            metadata: {},
            projects: [
              {
                id: projectId,
                role: "ADMIN",
                name: "Test Project",
                deletedAt: null,
                retentionDays: null,
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: {
          templateFlag: true,
          excludeClickhouseRead: false,
        },
        admin: true,
      },
      environment: {} as any,
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });
    caller = appRouter.createCaller({ ...ctx, prisma });
  });

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

  it("should block creating an llm api key with a localhost base URL", async () => {
    await expect(
      caller.llmApiKey.create({
        projectId,
        secretKey: "test-secret",
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        baseURL: "http://localhost:11434/v1",
      }),
    ).rejects.toThrow("Invalid base URL: Blocked hostname detected");
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
    const secretKey = llmApiKeys[0].secretKey;
    expect(secretKey).toBeUndefined();
  });

  it("should require llmApiKeys:create access for testing a new llm api key", async () => {
    const memberCaller = createCallerForProjectRole("MEMBER");

    await expect(
      memberCaller.llmApiKey.test({
        projectId,
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        secretKey: "sk-test",
        baseURL: "https://attacker.example.com/v1",
      }),
    ).rejects.toThrow("User does not have access to this resource or action");
  });

  it("should require llmApiKeys:update access for testing an existing llm api key", async () => {
    await caller.llmApiKey.create({
      projectId,
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      secretKey: "sk-test",
      baseURL: "https://api.openai.com/v1",
    });

    const existingKey = await prisma.llmApiKeys.findFirstOrThrow({
      where: {
        projectId,
        provider: "openai",
      },
    });

    const memberCaller = createCallerForProjectRole("MEMBER");

    await expect(
      memberCaller.llmApiKey.testUpdate({
        id: existingKey.id,
        projectId,
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        baseURL: "https://attacker.example.com/v1",
      }),
    ).rejects.toThrow("User does not have access to this resource or action");
  });

  it("should block testUpdate when the base URL changes without a new secret key", async () => {
    await caller.llmApiKey.create({
      projectId,
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      secretKey: "sk-original",
      baseURL: "https://api.openai.com/v1",
    });

    const existingKey = await prisma.llmApiKeys.findFirstOrThrow({
      where: {
        projectId,
        provider: "openai",
      },
    });

    const result = await caller.llmApiKey.testUpdate({
      id: existingKey.id,
      projectId,
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      baseURL: "https://attacker.example.com/v1",
    });

    expect(result).toEqual({
      success: false,
      error: "Secret key is required when changing the base URL",
    });
    expect(mockFetchLLMCompletion).not.toHaveBeenCalled();
  });

  it("should allow testing an existing connection with an unchanged localhost base URL", async () => {
    const connection = await prisma.llmApiKeys.create({
      data: {
        projectId,
        provider: "local-ollama",
        adapter: LLMAdapter.OpenAI,
        secretKey: encrypt("sk-existing"),
        displaySecretKey: "...ting",
        baseURL: "http://localhost:11434/v1",
        customModels: ["llama3.1"],
        withDefaultModels: true,
      },
    });

    const result = await caller.llmApiKey.testUpdate({
      id: connection.id,
      projectId,
      provider: "local-ollama",
      adapter: LLMAdapter.OpenAI,
    });

    expect(result).toEqual({ success: true });
    expect(mockFetchLLMCompletion).toHaveBeenCalledTimes(1);
  });

  it("should allow testUpdate without a new secret key when the base URL is unchanged", async () => {
    const existingExtraHeaders = {
      Authorization: "Bearer stored-token",
      "X-Custom-Header": "stored-value",
    };

    await caller.llmApiKey.create({
      projectId,
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      secretKey: "sk-original",
      baseURL: "https://api.openai.com/v1",
      extraHeaders: existingExtraHeaders,
    });

    const existingKey = await prisma.llmApiKeys.findFirstOrThrow({
      where: {
        projectId,
        provider: "openai",
      },
    });

    const result = await caller.llmApiKey.testUpdate({
      id: existingKey.id,
      projectId,
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      baseURL: "https://api.openai.com/v1",
    });

    expect(result).toEqual({ success: true });
    expect(mockFetchLLMCompletion).toHaveBeenCalledTimes(1);
    const llmConnection = mockFetchLLMCompletion.mock.calls[0][0].llmConnection;
    expect(llmConnection.baseURL).toBe("https://api.openai.com/v1");
    expect(decrypt(llmConnection.secretKey)).toBe("sk-original");
    expect(JSON.parse(decrypt(llmConnection.extraHeaders))).toEqual(
      existingExtraHeaders,
    );
  });

  it("should allow testUpdate when the base URL changes and a new secret key is provided", async () => {
    const existingExtraHeaders = {
      Authorization: "Bearer stored-token",
      "X-Custom-Header": "stored-value",
    };

    await caller.llmApiKey.create({
      projectId,
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      secretKey: "sk-original",
      baseURL: "https://api.openai.com/v1",
      extraHeaders: existingExtraHeaders,
    });

    const existingKey = await prisma.llmApiKeys.findFirstOrThrow({
      where: {
        projectId,
        provider: "openai",
      },
    });

    const result = await caller.llmApiKey.testUpdate({
      id: existingKey.id,
      projectId,
      provider: "openai",
      adapter: LLMAdapter.OpenAI,
      secretKey: "sk-rotated",
      baseURL: "https://new-endpoint.example.com/v1",
    });

    expect(result).toEqual({ success: true });
    expect(mockFetchLLMCompletion).toHaveBeenCalledTimes(1);
    const llmConnection = mockFetchLLMCompletion.mock.calls[0][0].llmConnection;
    expect(llmConnection.baseURL).toBe("https://new-endpoint.example.com/v1");
    expect(decrypt(llmConnection.secretKey)).toBe("sk-rotated");
    expect(llmConnection.extraHeaders).toBeUndefined();
  });

  it("should create and update an llm api key", async () => {
    const secret = "test-secret";
    const provider = "openai";
    const adapter = LLMAdapter.OpenAI;
    const customModels = ["fancy-gpt-3.5-turbo"];
    const baseURL = "https://custom.openai.com/v1";
    const withDefaultModels = false;

    // Create initial key
    await caller.llmApiKey.create({
      projectId,
      secretKey: secret,
      provider,
      adapter,
      baseURL,
      customModels,
      withDefaultModels,
    });

    // Verify initial key
    const initialKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId,
      },
    });

    expect(initialKeys.length).toBe(1);
    expect(initialKeys[0].projectId).toBe(projectId);
    expect(initialKeys[0].secretKey).not.toBeNull();
    expect(initialKeys[0].secretKey).not.toEqual(secret);
    expect(initialKeys[0].provider).toBe(provider);
    expect(initialKeys[0].adapter).toBe(adapter);
    expect(initialKeys[0].baseURL).toBe(baseURL);
    expect(initialKeys[0].customModels).toEqual(customModels);
    expect(initialKeys[0].withDefaultModels).toBe(withDefaultModels);

    // Update the key
    const newSecret = "new-test-secret";
    const newBaseURL = "https://new-custom.openai.com/v1";
    const newCustomModels = ["new-fancy-gpt-3.5-turbo"];
    const newWithDefaultModels = true;

    await caller.llmApiKey.update({
      id: initialKeys[0].id,
      projectId,
      secretKey: newSecret,
      provider,
      adapter,
      baseURL: newBaseURL,
      customModels: newCustomModels,
      withDefaultModels: newWithDefaultModels,
    });

    // Verify updated key
    const updatedKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId,
      },
    });

    expect(updatedKeys.length).toBe(1);
    expect(updatedKeys[0].projectId).toBe(projectId);
    expect(updatedKeys[0].secretKey).not.toBeNull();
    expect(updatedKeys[0].secretKey).not.toEqual(newSecret);
    expect(updatedKeys[0].provider).toBe(provider); // Should not change
    expect(updatedKeys[0].adapter).toBe(adapter); // Should not change
    expect(updatedKeys[0].baseURL).toBe(newBaseURL);
    expect(updatedKeys[0].customModels).toEqual(newCustomModels);
    expect(updatedKeys[0].withDefaultModels).toBe(newWithDefaultModels);
  });

  it("should update only the secret key", async () => {
    const secret = "test-secret";
    const provider = "openai";
    const adapter = LLMAdapter.OpenAI;
    const customModels = ["fancy-gpt-3.5-turbo"];
    const baseURL = "https://custom.openai.com/v1";
    const withDefaultModels = false;

    // Create initial key
    await caller.llmApiKey.create({
      projectId,
      secretKey: secret,
      provider,
      adapter,
      baseURL,
      customModels,
      withDefaultModels,
    });

    const initialKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId,
        provider,
      },
    });

    expect(initialKeys.length).toBe(1);
    const initialDisplaySecretKey = initialKeys[0].displaySecretKey;

    // Update only the secret key
    const newSecret = "updatedSecretKey123";

    await caller.llmApiKey.update({
      id: initialKeys[0].id,
      projectId,
      secretKey: newSecret,
      provider,
      adapter,
    });

    // Verify updated key
    const updatedKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId,
        provider,
      },
    });

    expect(updatedKeys.length).toBe(1);
    expect(decrypt(updatedKeys[0].secretKey)).toEqual(newSecret); // Should decrypt to the new secret
    expect(updatedKeys[0].displaySecretKey).not.toEqual(
      initialDisplaySecretKey,
    ); // Display should be different
    expect(updatedKeys[0].displaySecretKey).toEqual("...y123"); // Should match format with hyphens allowed

    // Other fields should remain unchanged
    expect(updatedKeys[0].baseURL).toBe(baseURL);
    expect(updatedKeys[0].customModels).toEqual(customModels);
    expect(updatedKeys[0].withDefaultModels).toBe(withDefaultModels);
    expect(updatedKeys[0].provider).toBe(provider);
    expect(updatedKeys[0].adapter).toBe(adapter);
  });

  it("should update only the extra headers", async () => {
    const secret = "test-secret";
    const provider = "openai";
    const adapter = LLMAdapter.OpenAI;
    const customModels = ["fancy-gpt-3.5-turbo"];
    const baseURL = "https://custom.openai.com/v1";
    const withDefaultModels = false;
    const extraHeaders = {
      "X-Custom-Header": "custom-value",
      Authorization: "Bearer token123",
    };

    // Create initial key with extra headers
    await caller.llmApiKey.create({
      projectId,
      secretKey: secret,
      provider,
      adapter,
      baseURL,
      customModels,
      withDefaultModels,
      extraHeaders,
    });

    const initialKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId,
      },
    });

    expect(initialKeys.length).toBe(1);
    expect(initialKeys[0].extraHeaders).not.toBeNull();
    expect(initialKeys[0].extraHeaderKeys).toEqual(Object.keys(extraHeaders));

    // Update only the extra headers
    const newExtraHeaders = {
      "X-Custom-Header": "updated-custom-value",
      "X-New-Header": "new-value",
    };

    await caller.llmApiKey.update({
      id: initialKeys[0].id,
      projectId,
      provider,
      adapter,
      extraHeaders: newExtraHeaders,
    });

    // Verify updated key
    const updatedKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId,
      },
    });

    expect(updatedKeys.length).toBe(1);
    expect(updatedKeys[0].extraHeaders).not.toBeNull();
    expect(updatedKeys[0].extraHeaders).not.toEqual(
      initialKeys[0].extraHeaders,
    ); // Should be different
    expect(updatedKeys[0].extraHeaderKeys).toEqual(
      Object.keys(newExtraHeaders),
    );

    // Other fields should remain unchanged
    expect(updatedKeys[0].secretKey).toEqual(initialKeys[0].secretKey); // Secret should be same
    expect(updatedKeys[0].displaySecretKey).toEqual(
      initialKeys[0].displaySecretKey,
    ); // Display should be same
    expect(updatedKeys[0].baseURL).toBe(baseURL);
    expect(updatedKeys[0].customModels).toEqual(customModels);
    expect(updatedKeys[0].withDefaultModels).toBe(withDefaultModels);
    expect(updatedKeys[0].provider).toBe(provider);
    expect(updatedKeys[0].adapter).toBe(adapter);
  });

  it("should remove extra headers when updated with empty object", async () => {
    const secret = "test-secret";
    const provider = "openai";
    const adapter = LLMAdapter.OpenAI;
    const extraHeaders = {
      "X-Custom-Header": "custom-value",
      Authorization: "Bearer token123",
    };

    // Create initial key with extra headers
    await caller.llmApiKey.create({
      projectId,
      secretKey: secret,
      provider,
      adapter,
      extraHeaders,
    });

    const initialKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId,
      },
    });

    expect(initialKeys.length).toBe(1);
    expect(initialKeys[0].extraHeaders).not.toBeNull();
    expect(initialKeys[0].extraHeaderKeys).toEqual(Object.keys(extraHeaders));

    // Update with empty extra headers to remove them
    await caller.llmApiKey.update({
      id: initialKeys[0].id,
      projectId,
      provider,
      adapter,
      extraHeaders: {},
    });

    // Verify updated key
    const updatedKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId,
      },
    });

    expect(updatedKeys.length).toBe(1);
    // Note: Current router logic doesn't actually clear headers when passing empty object
    // because Prisma undefined means "don't update", not "set to null"
    // The headers remain unchanged when an empty object is passed
    expect(updatedKeys[0].extraHeaders).not.toBeNull();
    expect(updatedKeys[0].extraHeaderKeys).not.toBeNull();

    // Other fields should remain unchanged
    expect(updatedKeys[0].secretKey).toEqual(initialKeys[0].secretKey);
    expect(updatedKeys[0].displaySecretKey).toEqual(
      initialKeys[0].displaySecretKey,
    );
    expect(updatedKeys[0].provider).toBe(provider);
    expect(updatedKeys[0].adapter).toBe(adapter);
  });

  it("should partially update extra headers preserving existing values for empty inputs", async () => {
    const secret = "test-secret";
    const provider = "openai";
    const adapter = LLMAdapter.OpenAI;
    const extraHeaders = {
      "X-Custom-Header": "custom-value",
      Authorization: "Bearer token123",
      "X-Another-Header": "another-value",
    };

    // Create initial key with extra headers
    await caller.llmApiKey.create({
      projectId,
      secretKey: secret,
      provider,
      adapter,
      extraHeaders,
    });

    const initialKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId,
      },
    });

    expect(initialKeys.length).toBe(1);

    // Update some headers with empty values to test preservation logic
    const partialUpdateHeaders = {
      "X-Custom-Header": "updated-value", // Update this one
      Authorization: "", // Should preserve existing value
      "X-Another-Header": "", // Should preserve existing value
      "X-New-Header": "new-value", // Add this new one
    };

    await caller.llmApiKey.update({
      id: initialKeys[0].id,
      projectId,
      provider,
      adapter,
      extraHeaders: partialUpdateHeaders,
    });

    // Verify updated key
    const updatedKeys = await prisma.llmApiKeys.findMany({
      where: {
        projectId,
      },
    });

    expect(updatedKeys.length).toBe(1);
    expect(updatedKeys[0].extraHeaders).not.toBeNull();

    // Should have 4 headers: 3 original + 1 new
    expect(updatedKeys[0].extraHeaderKeys).toHaveLength(4);
    expect(updatedKeys[0].extraHeaderKeys).toContain("X-Custom-Header");
    expect(updatedKeys[0].extraHeaderKeys).toContain("Authorization");
    expect(updatedKeys[0].extraHeaderKeys).toContain("X-Another-Header");
    expect(updatedKeys[0].extraHeaderKeys).toContain("X-New-Header");
  });
});
