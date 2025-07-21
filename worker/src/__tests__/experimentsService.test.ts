// Set environment variable before any imports to ensure it's picked up
process.env.LANGFUSE_DATASET_RUN_ITEMS_WRITE_CH = "true";

import { expect, test, describe, vi, beforeEach } from "vitest";
import { Prompt, kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";
import { pruneDatabase } from "./utils";
import { LLMAdapter } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { callLLM } from "../features/utils/utilities";
import {
  getDatasetRunItemsByRunId,
  PROMPT_EXPERIMENT_ENVIRONMENT,
} from "@langfuse/shared/src/server";
import { createExperimentJobClickhouse } from "../features/experiments/experimentServiceClickhouse";
import waitForExpect from "wait-for-expect";

vi.mock("../features/utils/utilities", () => ({
  callLLM: vi.fn().mockResolvedValue({ id: "test-id" }),
  compileHandlebarString: vi.fn().mockImplementation((str, context) => {
    // Simple mock that replaces handlebars variables with their values
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] || "");
  }),
}));

describe("create experiment jobs", () => {
  test.only("creates new experiment job", async () => {
    await pruneDatabase();
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const datasetId = randomUUID();
    const runId = randomUUID();
    const promptId = "03f834cc-c089-4bcb-9add-b14cadcdf47c";

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
    await kyselyPrisma.$kysely
      .insertInto("dataset_runs")
      .values({
        id: runId,
        name: "Test Run",
        project_id: projectId,
        dataset_id: datasetId,
        metadata: {
          prompt_id: promptId,
          provider: "openai",
          model: "gpt-3.5-turbo",
          model_params: { temperature: 0 },
        },
      })
      .execute();

    // Create dataset item
    await prisma.datasetItem.create({
      data: {
        id: randomUUID(),
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
    await createExperimentJobClickhouse({ event: payload });

    await waitForExpect(async () => {
      const runItems = await getDatasetRunItemsByRunId({
        projectId,
        runId: runId,
        datasetId,
      });
      expect(runItems).toHaveLength(1);
      expect(runItems[0].projectId).toBe(projectId);
      expect(runItems[0].datasetRunId).toBe(runId);
      expect(runItems[0].traceId).toBeDefined();
    });
  }, 10_000);

  test("creates dataset run items with error for invalid metadata", async () => {
    await pruneDatabase();
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const datasetId = randomUUID();
    const runId = randomUUID();
    const promptId = "03f834cc-c089-4bcb-9add-b14cadcdf47c";

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

    // Create dataset run with invalid metadata
    await kyselyPrisma.$kysely
      .insertInto("dataset_runs")
      .values({
        id: runId,
        name: "Test Run",
        project_id: projectId,
        dataset_id: datasetId,
        metadata: {
          provider: "I was just kidding",
          model: "no model",
        },
      })
      .execute();

    const payload = {
      projectId,
      datasetId,
      runId,
    };

    await createExperimentJobClickhouse({ event: payload });

    await waitForExpect(async () => {
      const runItems = await getDatasetRunItemsByRunId({
        projectId,
        runId: runId,
        datasetId,
      });
      expect(runItems).toHaveLength(1);
      expect(runItems[0].projectId).toBe(projectId);
      expect(runItems[0].datasetRunId).toBe(runId);
      expect(runItems[0].error).toBeDefined();
    });
  }, 10_000);

  test("creates dataset run items with error if prompt has invalid content", async () => {
    await pruneDatabase();
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const datasetId = randomUUID();
    const runId = randomUUID();
    const promptId = "03f834cc-c089-4bcb-9add-b14cadcdf47c";

    // Create dataset
    await prisma.dataset.create({
      data: {
        id: datasetId,
        projectId,
        name: "Test Dataset",
      },
    });

    // Create required prompt
    await prisma.prompt.create({
      data: {
        id: promptId,
        projectId,
        name: "Test Prompt",
        prompt: "Hello {{invalidVariable}}",
        type: "text",
        version: 1,
        createdBy: "test-user",
      },
    });

    // Create dataset run with metadata
    await kyselyPrisma.$kysely
      .insertInto("dataset_runs")
      .values({
        id: runId,
        name: "Test Run",
        project_id: projectId,
        dataset_id: datasetId,
        metadata: {
          prompt_id: promptId,
          provider: "openai",
          model: "gpt-3.5-turbo",
          model_params: { temperature: 0 },
        },
      })
      .execute();

    const payload = {
      projectId,
      datasetId,
      runId,
    };

    await createExperimentJobClickhouse({ event: payload });

    await waitForExpect(async () => {
      const runItems = await getDatasetRunItemsByRunId({
        projectId,
        runId: runId,
        datasetId,
      });
      expect(runItems).toHaveLength(1);
      expect(runItems[0].projectId).toBe(projectId);
      expect(runItems[0].datasetRunId).toBe(runId);
      expect(runItems[0].error).toBeDefined();
    });
  }, 10_000);

  test("creates no dataset run items if no item in dataset matches prompt variables", async () => {
    await pruneDatabase();
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
    await kyselyPrisma.$kysely
      .insertInto("dataset_runs")
      .values({
        id: runId,
        name: "Test Run",
        project_id: projectId,
        dataset_id: datasetId,
        metadata: {
          prompt_id: promptId,
          provider: "openai",
          model: "gpt-3.5-turbo",
          model_params: { temperature: 0 },
        },
      })
      .execute();

    // Create dataset item with mismatched variables
    await prisma.datasetItem.create({
      data: {
        id: randomUUID(),
        projectId,
        datasetId,
        input: { wrongVariable: "World" },
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

    await waitForExpect(async () => {
      const runItems = await getDatasetRunItemsByRunId({
        projectId,
        runId: runId,
        datasetId,
      });
      expect(runItems).toHaveLength(0);
    });
  }, 10_000);
});

describe("create experiment jobs with placeholders", () => {
  const setupPlaceholderTest = async (
    promptConfig: any,
    datasetItemInput: any,
  ) => {
    await pruneDatabase();
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
    await kyselyPrisma.$kysely
      .insertInto("dataset_runs")
      .values({
        id: runId,
        name: "Test Run",
        project_id: projectId,
        dataset_id: datasetId,
        metadata: {
          prompt_id: promptId,
          provider: "openai",
          model: "gpt-3.5-turbo",
          model_params: { temperature: 0 },
        },
      })
      .execute();

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

  test("creates experiment job with multiple placeholders containing variables", async () => {
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

    await createExperimentJobClickhouse({ event: payload });

    await waitForExpect(async () => {
      const runItems = await getDatasetRunItemsByRunId({
        projectId,
        runId: runId,
        datasetId,
      });
      expect(runItems).toHaveLength(1);
      expect(runItems[0].projectId).toBe(projectId);
      expect(runItems[0].datasetRunId).toBe(runId);
      expect(runItems[0].traceId).toBeDefined();
    });
  }, 10_000);

  test("handles empty placeholder arrays", async () => {
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

    await createExperimentJobClickhouse({ event: payload });

    await waitForExpect(async () => {
      const runItems = await getDatasetRunItemsByRunId({
        projectId,
        runId: runId,
        datasetId,
      });
      expect(runItems).toHaveLength(1);
      expect(runItems[0].projectId).toBe(projectId);
      expect(runItems[0].datasetRunId).toBe(runId);
      expect(runItems[0].traceId).toBeDefined();
    });
  }, 10_000);

  test("creates dataset run item with error when placeholder has invalid message format", async () => {
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

    await createExperimentJobClickhouse({ event: payload });

    await waitForExpect(async () => {
      const runItems = await getDatasetRunItemsByRunId({
        projectId,
        runId: runId,
        datasetId,
      });
      expect(runItems).toHaveLength(1);
      expect(runItems[0].projectId).toBe(projectId);
      expect(runItems[0].datasetRunId).toBe(runId);
      expect(runItems[0].error).toBeDefined();
    });
  }, 10_000);
});

describe("create experiment job calls with langfuse server side tracing", async () => {
  await pruneDatabase();
  const mockEvent = {
    datasetId: "dataset-123",
    projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    runId: "run-123",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock database queries
    const mockDatasetRunResponse = {
      metadata: {
        prompt_id: "prompt-123",
        provider: "openai",
        model: "gpt-3.5-turbo",
        model_params: {},
      },
    };

    const mockPromptResponse = {
      id: "prompt-123",
      projectId: mockEvent.projectId,
      name: "Test Prompt",
      prompt: "Hello {{name}}",
      type: "text",
    };

    vi.spyOn(kyselyPrisma.$kysely, "selectFrom").mockImplementation(
      (table) =>
        ({
          selectAll: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnThis(), // This allows for infinite where chaining
            executeTakeFirst: vi.fn().mockImplementation(() => {
              // Different responses based on table
              if (table === "dataset_run_items") {
                return Promise.resolve(null); // For the 3-where query
              }
              if (table === "dataset_runs") {
                return Promise.resolve(mockDatasetRunResponse);
              }
              if (table === "prompts") {
                return Promise.resolve(mockPromptResponse);
              }
            }),
          }),
        }) as any,
    );

    vi.spyOn(prisma.prompt, "findUnique").mockResolvedValue(
      mockPromptResponse as Prompt,
    );

    vi.spyOn(prisma.datasetItem, "findMany").mockResolvedValue([
      {
        id: "item-123",
        input: { name: "test" },
      } as any,
    ]);

    vi.spyOn(prisma.llmApiKeys, "findFirst").mockResolvedValue({
      key: "test-key",
    } as any);

    vi.spyOn(prisma.llmApiKeys, "findFirst").mockResolvedValue({
      id: randomUUID(),
      projectId: mockEvent.projectId,
      createdAt: new Date(),
      updatedAt: new Date(),
      adapter: LLMAdapter.OpenAI,
      provider: "openai",
      displaySecretKey: "test-key",
      secretKey: encrypt("test-key"),
      baseURL: null,
      customModels: [],
      extraHeaderKeys: [],
      withDefaultModels: true,
      config: null,
    } as any);
  });

  test("should create a trace with correct parameters", async () => {
    await createExperimentJobClickhouse({ event: mockEvent });

    // Verify callLLM was called with correct trace parameters
    expect(callLLM).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      expect.any(Object),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        environment: PROMPT_EXPERIMENT_ENVIRONMENT,
        traceName: expect.stringMatching(/^dataset-run-item-/),
        traceId: expect.any(String),
        projectId: mockEvent.projectId,
        authCheck: expect.objectContaining({
          validKey: true,
          scope: expect.objectContaining({
            projectId: mockEvent.projectId,
            accessLevel: "project",
          }),
        }),
      }),
    );
  });
});
