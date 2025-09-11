import { expect, test, describe, beforeEach, vi, afterEach } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";
import { pruneDatabase } from "./utils";
import { LLMAdapter } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { createExperimentJobClickhouse } from "../features/experiments/experimentServiceClickhouse";
import { logger } from "@langfuse/shared/src/server";
import { callLLM } from "../features/utils/utilities";

// Mock LLM completion call
vi.mock("../features/utils/utilities", () => ({
  callLLM: vi.fn().mockResolvedValue({ id: "test-id" }),
  compileHandlebarString: vi.fn().mockImplementation((str, context) => {
    // Simple mock that replaces handlebars variables with their values
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] || "");
  }),
}));

// Mock the logger to capture log calls
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
});

describe("create experiment jobs", () => {
  const mockLogger = vi.mocked(logger);

  beforeEach(async () => {
    await pruneDatabase();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  test("processes valid experiment without throwing", async () => {
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const datasetId = randomUUID();
    const runId = randomUUID();
    const promptId = "03f834cc-c089-4bcb-9add-b14cadcdf47c";
    const datasetItemId = randomUUID();

    // Create required prompt
    await prisma.prompt.create({
      data: {
        id: promptId,
        projectId,
        name: "Test Prompt",
        prompt: "Hello {{name}}",
        type: "text",
        version: 1,
        createdBy: "test-user",
      },
    });
    // Create dataset
    await prisma.dataset.create({
      data: {
        id: datasetId,
        projectId,
        name: "Test Dataset",
      },
    });

    // Create dataset run with metadata
    await prisma.datasetRuns.create({
      data: {
        id: runId,
        name: "Test Run",
        projectId: projectId,
        datasetId: datasetId,
        metadata: {
          prompt_id: promptId,
          provider: "openai",
          model: "gpt-3.5-turbo",
          model_params: { temperature: 0 },
        },
      },
    });

    // Create dataset item
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        projectId,
        datasetId,
        input: { name: "World" },
      },
    });
    // Create API key
    await prisma.llmApiKeys.create({
      data: {
        id: randomUUID(),
        projectId,
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        displaySecretKey: "test-key",
        secretKey: encrypt("test-key"),
      },
    });
    const payload = {
      projectId,
      datasetId,
      runId,
    };

    const result = await createExperimentJobClickhouse({ event: payload });

    // Just verify it doesn't throw and returns success
    expect(result).toEqual({ success: true });

    // Verify that processing info was logged
    expect(mockLogger.info).toHaveBeenCalledWith(
      "Processing experiment create job with ClickHouse batching",
      expect.objectContaining({
        projectId,
        datasetId,
        runId,
      }),
    );
  });

  test("handles experiment validation failure (missing prompt_id) without throwing", async () => {
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const datasetId = randomUUID();
    const runId = randomUUID();
    const datasetItemId = randomUUID();

    // Create dataset
    await prisma.dataset.create({
      data: {
        id: datasetId,
        projectId,
        name: "Test Dataset",
      },
    });

    // Create dataset run with invalid metadata (missing required fields)
    await prisma.datasetRuns.create({
      data: {
        id: runId,
        name: "Test Run",
        projectId: projectId,
        datasetId: datasetId,
        metadata: {
          provider: "invalid_provider",
          model: "invalid_model",
          // Missing prompt_id
        },
      },
    });

    // Create dataset item so there's something to create error run items for
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        projectId,
        datasetId,
        input: { name: "World" },
      },
    });

    const payload = {
      projectId,
      datasetId,
      runId,
    };

    const result = await createExperimentJobClickhouse({ event: payload });

    // Verify it doesn't throw and returns success even with validation errors
    expect(result).toEqual({ success: true });

    // Verify that an error was logged during validation failure
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Failed to validate and setup experiment",
      expect.any(Error),
    );
  });

  test("handles prompt with variables without throwing", async () => {
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const datasetId = randomUUID();
    const runId = randomUUID();
    const promptId = "03f834cc-c089-4bcb-9add-b14cadcdf47c";
    const datasetItemId = randomUUID();

    // Create dataset
    await prisma.dataset.create({
      data: {
        id: datasetId,
        projectId,
        name: "Test Dataset",
      },
    });

    // Create required prompt with variable
    await prisma.prompt.create({
      data: {
        id: promptId,
        projectId,
        name: "Test Prompt",
        prompt: "Hello {{name}}",
        type: "text",
        version: 1,
        createdBy: "test-user",
      },
    });

    // Create dataset run with metadata
    await prisma.datasetRuns.create({
      data: {
        id: runId,
        name: "Test Run",
        projectId: projectId,
        datasetId: datasetId,
        metadata: {
          prompt_id: promptId,
          provider: "openai",
          model: "gpt-3.5-turbo",
          model_params: { temperature: 0 },
        },
      },
    });

    // Create dataset item
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        projectId,
        datasetId,
        input: { name: "test" },
      },
    });

    // Create API key
    await prisma.llmApiKeys.create({
      data: {
        id: randomUUID(),
        projectId,
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        displaySecretKey: "test-key",
        secretKey: encrypt("test-key"),
      },
    });

    const payload = {
      projectId,
      datasetId,
      runId,
    };

    const result = await createExperimentJobClickhouse({ event: payload });

    // Just verify it doesn't throw and returns success
    expect(result).toEqual({ success: true });
  });

  test("handles mismatched dataset variables without throwing", async () => {
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const datasetId = randomUUID();
    const runId = randomUUID();
    const promptId = "03f834cc-c089-4bcb-9add-b14cadcdf47c";
    // Create prompt with variable that won't match dataset item
    await prisma.prompt.create({
      data: {
        id: promptId,
        projectId,
        name: "Test Prompt",
        prompt: "Hello {{name}}",
        type: "text",
        version: 1,
        createdBy: "test-user",
      },
    });
    // Create dataset
    await prisma.dataset.create({
      data: {
        id: datasetId,
        projectId,
        name: "Test Dataset",
      },
    });

    // Create dataset run with metadata
    await prisma.datasetRuns.create({
      data: {
        id: runId,
        name: "Test Run",
        projectId: projectId,
        datasetId: datasetId,
        metadata: {
          prompt_id: promptId,
          provider: "openai",
          model: "gpt-3.5-turbo",
          model_params: { temperature: 0 },
        },
      },
    });

    // Create dataset item with mismatched variables
    await prisma.datasetItem.create({
      data: {
        id: randomUUID(),
        projectId,
        datasetId,
        input: { wrongVariable: "World" }, // doesn't have "name" variable
      },
    });

    // Create API key
    await prisma.llmApiKeys.create({
      data: {
        id: randomUUID(),
        projectId,
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        displaySecretKey: "test-key",
        secretKey: encrypt("test-key"),
      },
    });
    const payload = {
      projectId,
      datasetId,
      runId,
    };

    const result = await createExperimentJobClickhouse({ event: payload });

    // Just verify it doesn't throw and returns success
    expect(result).toEqual({ success: true });
  });
});

describe("create experiment jobs with placeholders", () => {
  const mockLogger = vi.mocked(logger);

  beforeEach(async () => {
    await pruneDatabase();
    vi.clearAllMocks();
  });

  const setupPlaceholderTest = async (
    promptConfig: any,
    datasetItemInput: any,
  ) => {
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const datasetId = randomUUID();
    const runId = randomUUID();
    const promptId = "03f834cc-c089-4bcb-9add-b14cadcdf47c";
    // Create prompt
    await prisma.prompt.create({
      data: {
        id: promptId,
        projectId,
        name: promptConfig.name,
        prompt: promptConfig.prompt,
        type: "chat",
        version: 1,
        createdBy: "test-user",
      },
    });
    // Create dataset
    await prisma.dataset.create({
      data: {
        id: datasetId,
        projectId,
        name: "Test Dataset",
      },
    });

    // Create dataset run with metadata
    await prisma.datasetRuns.create({
      data: {
        id: runId,
        name: "Test Run",
        projectId: projectId,
        datasetId: datasetId,
        metadata: {
          prompt_id: promptId,
          provider: "openai",
          model: "gpt-3.5-turbo",
          model_params: { temperature: 0 },
        },
      },
    });

    // Create dataset item
    await prisma.datasetItem.create({
      data: {
        id: randomUUID(),
        projectId,
        datasetId,
        input: datasetItemInput,
      },
    });
    // Create API key
    await prisma.llmApiKeys.create({
      data: {
        id: randomUUID(),
        projectId,
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        displaySecretKey: "test-key",
        secretKey: encrypt("test-key"),
      },
    });
    return { projectId, datasetId, runId };
  };

  test("handles multiple placeholders without throwing", async () => {
    const { projectId, datasetId, runId } = await setupPlaceholderTest(
      {
        name: "Test Multiple Placeholders",
        prompt: [
          { role: "system", content: "You are a helpful assistant." },
          { type: "placeholder", name: "conversation_history" },
          { type: "placeholder", name: "user_context" },
          { role: "user", content: "Please help me." },
        ],
      },
      {
        conversation_history: [
          { role: "user", content: "Hello {{name}}!" },
          { role: "assistant", content: "Hi there!" },
        ],
        user_context: [{ role: "system", content: "User is a {{role}}" }],
        name: "John",
        role: "developer",
      },
    );
    const payload = {
      projectId,
      datasetId,
      runId,
    };

    const result = await createExperimentJobClickhouse({ event: payload });

    // Just verify it doesn't throw and returns success
    expect(result).toEqual({ success: true });
  });

  test("handles empty placeholder arrays without throwing", async () => {
    const { projectId, datasetId, runId } = await setupPlaceholderTest(
      {
        name: "Test Empty Placeholder",
        prompt: [
          { role: "system", content: "You are a helpful assistant." },
          { type: "placeholder", name: "empty_history" },
          { role: "user", content: "Start conversation." },
        ],
      },
      { empty_history: [] },
    );
    const payload = {
      projectId,
      datasetId,
      runId,
    };

    const result = await createExperimentJobClickhouse({ event: payload });

    // Just verify it doesn't throw and returns success
    expect(result).toEqual({ success: true });
  });

  test("handles invalid placeholder formats without throwing", async () => {
    const { projectId, datasetId, runId } = await setupPlaceholderTest(
      {
        name: "Test Invalid Placeholder",
        prompt: [
          { role: "system", content: "You are a helpful assistant." },
          { type: "placeholder", name: "invalid_messages" },
          { role: "user", content: "Help me." },
        ],
      },
      { invalid_messages: "this should be an array or object" },
    );
    const payload = {
      projectId,
      datasetId,
      runId,
    };

    const result = await createExperimentJobClickhouse({ event: payload });

    // Just verify it doesn't throw and returns success
    expect(result).toEqual({ success: true });
  });
});

describe("experiment processing integration", () => {
  beforeEach(async () => {
    await pruneDatabase();
    vi.clearAllMocks();
  });

  test("processes experiment end-to-end without throwing", async () => {
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const datasetId = randomUUID();
    const runId = randomUUID();
    const promptId = "03f834cc-c089-4bcb-9add-b14cadcdf47c";
    const datasetItemId = randomUUID();

    // Create required prompt
    await prisma.prompt.create({
      data: {
        id: promptId,
        projectId,
        name: "Test Prompt",
        prompt: "Hello {{name}}",
        type: "text",
        version: 1,
        createdBy: "test-user",
      },
    });

    // Create dataset
    await prisma.dataset.create({
      data: {
        id: datasetId,
        projectId,
        name: "Test Dataset",
      },
    });

    // Create dataset run with metadata
    await prisma.datasetRuns.create({
      data: {
        id: runId,
        name: "Test Run",
        projectId: projectId,
        datasetId: datasetId,
        metadata: {
          prompt_id: promptId,
          provider: "openai",
          model: "gpt-3.5-turbo",
          model_params: { temperature: 0 },
        },
      },
    });

    // Create dataset item
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        projectId,
        datasetId,
        input: { name: "World" },
      },
    });

    // Create API key
    await prisma.llmApiKeys.create({
      data: {
        id: randomUUID(),
        projectId,
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        displaySecretKey: "test-key",
        secretKey: encrypt("test-key"),
      },
    });

    const payload = {
      projectId,
      datasetId,
      runId,
    };

    const result = await createExperimentJobClickhouse({ event: payload });

    // Just verify it completes successfully
    expect(result).toEqual({ success: true });

    // TODO: add when we remove PG execution path
    // expect(callLLM).toHaveBeenCalledWith(
    //   expect.any(Object),
    //   expect.any(Array),
    //   expect.any(Object),
    //   expect.any(String),
    //   expect.any(String),
    //   expect.objectContaining({
    //     environment: "langfuse-prompt-experiment",
    //     traceName: expect.stringMatching(/^dataset-run-item-/),
    //     traceId: expect.any(String),
    //     projectId: projectId,
    //     authCheck: expect.objectContaining({
    //       validKey: true,
    //       scope: expect.objectContaining({
    //         projectId: projectId,
    //         accessLevel: "project",
    //       }),
    //     }),
    //   }),
    // );
  });
});
