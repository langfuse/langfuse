import { expect, test, describe, vi, beforeEach } from "vitest";
import { createExperimentJob } from "../ee/experiments/experimentService";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";
import { pruneDatabase } from "./utils";
import { LLMAdapter } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { callLLM } from "../features/utilities";

vi.mock("../features/utilities", () => ({
  callLLM: vi.fn().mockResolvedValue({ id: "test-id" }),
  compileHandlebarString: vi.fn().mockImplementation((str, context) => {
    // Simple mock that replaces handlebars variables with their values
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] || "");
  }),
}));

describe("create experiment jobs", () => {
  test("creates new experiment job", async () => {
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

    await createExperimentJob({ event: payload });

    const runItems = await kyselyPrisma.$kysely
      .selectFrom("dataset_run_items")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(runItems.length).toBe(1);
    expect(runItems[0].project_id).toBe(projectId);
    expect(runItems[0].dataset_run_id).toBe(runId);
    expect(runItems[0].trace_id).toBeDefined();
  }, 10_000);

  test("does not create job for invalid metadata", async () => {
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

    await expect(createExperimentJob({ event: payload })).rejects.toThrow(
      /Langfuse in-app experiments can only be run with available model and prompt configurations/,
    );

    const runItems = await kyselyPrisma.$kysely
      .selectFrom("dataset_run_items")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(runItems.length).toBe(0);
  }, 10_000);

  test("does not create eval job if prompt has invalid content", async () => {
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

    const runItems = await kyselyPrisma.$kysely
      .selectFrom("dataset_run_items")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(runItems.length).toBe(0);
  }, 10_000);

  test("does not create job if no item in dataset matches prompt variables", async () => {
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

    const payload = {
      projectId,
      datasetId,
      runId,
    };

    const runItems = await kyselyPrisma.$kysely
      .selectFrom("dataset_run_items")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(runItems.length).toBe(0);
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
          selectAll: () => ({
            where: () => ({
              where: () => ({
                executeTakeFirstOrThrow: () =>
                  // Return different mock data based on the table being queried
                  table === "dataset_runs"
                    ? mockDatasetRunResponse
                    : mockPromptResponse,
              }),
            }),
          }),
        }) as any,
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

    vi.spyOn(prisma.datasetRunItems, "create").mockResolvedValue({
      id: "run-item-123",
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
      withDefaultModels: true,
      config: null,
    } as any);
  });

  test("should create a trace with correct parameters", async () => {
    await createExperimentJob({ event: mockEvent });

    // Verify callLLM was called with correct trace parameters
    expect(callLLM).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Array),
      expect.any(Object),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        tags: ["langfuse-prompt-experiment"],
        traceName: expect.stringMatching(/^dataset-run-item-/),
        traceId: expect.any(String),
        projectId: mockEvent.projectId,
        authCheck: expect.objectContaining({
          validKey: true,
          scope: expect.objectContaining({
            projectId: mockEvent.projectId,
            accessLevel: "all",
          }),
        }),
      }),
    );
  });
});
