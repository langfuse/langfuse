import { expect, test, describe, beforeEach } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";
import { pruneDatabase } from "./utils";
import { LLMAdapter } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { createExperimentJobClickhouse } from "../features/experiments/experimentServiceClickhouse";

describe("create experiment jobs", () => {
  beforeEach(async () => {
    await pruneDatabase();
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
  });

  test("handles experiment validation failure without throwing", async () => {
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

    // Just verify it doesn't throw and returns success even with validation errors
    expect(result).toEqual({ success: true });
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
  beforeEach(async () => {
    await pruneDatabase();
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
  });
});
