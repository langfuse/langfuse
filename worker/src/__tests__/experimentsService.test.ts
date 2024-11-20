import { expect, test, describe, vi, beforeEach } from "vitest";
import { createExperimentJob } from "../ee/experiments/experimentService";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";
import { pruneDatabase } from "./utils";
import { LLMAdapter } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { callLLM } from "../features/utilities";

// Mock dependencies
vi.mock("@langfuse/shared/src/db");
vi.mock("../../../features/utilities");
vi.mock("@langfuse/shared/src/server");

describe("create experiment jobs", () => {
  test("creates new experiment job", async () => {
    await pruneDatabase();
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const datasetId = randomUUID();
    const runId = randomUUID();
    const promptId = randomUUID();

    // Create required prompt
    await kyselyPrisma.$kysely
      .insertInto("prompts")
      .values({
        id: promptId,
        project_id: projectId,
        name: "Test Prompt",
        prompt: "Hello {{name}}",
        type: "text",
        version: 1,
        created_by: "test-user",
      })
      .execute();

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
    const projectId = randomUUID();
    const datasetId = randomUUID();
    const runId = randomUUID();
    const promptId = randomUUID();

    // Create required prompt
    await kyselyPrisma.$kysely
      .insertInto("prompts")
      .values({
        id: promptId,
        project_id: projectId,
        name: "Test Prompt",
        prompt: "Hello {{name}}",
        type: "text",
        version: 1,
        created_by: "test-user",
      })
      .execute();

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

  test("does not create eval job if prompt is not found", async () => {
    await pruneDatabase();
    const projectId = randomUUID();
    const datasetId = randomUUID();
    const runId = randomUUID();
    const promptId = randomUUID();

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

    await expect(createExperimentJob({ event: payload })).rejects.toThrow(
      /Prompt .* not found for project .*/,
    );

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
    const promptId = randomUUID();

    // Create prompt with variable that won't match dataset item
    await kyselyPrisma.$kysely
      .insertInto("prompts")
      .values({
        id: promptId,
        project_id: projectId,
        name: "Test Prompt",
        prompt: "Hello {{requiredVariable}}", // Dataset item won't have this variable
        type: "text",
        version: 1,
        created_by: "test-user",
      })
      .execute();

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
        input: { wrongVariable: "World" }, // Doesn't match prompt variable
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

    await expect(createExperimentJob({ event: payload })).rejects.toThrow(
      /No Dataset .* item input matches expected prompt variable format/,
    );

    const runItems = await kyselyPrisma.$kysely
      .selectFrom("dataset_run_items")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(runItems.length).toBe(0);
  }, 10_000);
});

describe("create experiment job calls with langfuse server side tracing", () => {
  const mockEvent = {
    datasetId: "dataset-123",
    projectId: "project-123",
    runId: "run-123",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock database queries
    const mockResponse = {
      metadata: {
        prompt_id: "prompt-123",
        provider: "openai",
        model: "gpt-3.5-turbo",
        model_params: {},
      },
    };

    vi.mocked(kyselyPrisma.$kysely.selectFrom).mockReturnValue({
      selectAll: () => ({
        where: () => ({
          where: () => ({
            executeTakeFirstOrThrow: () => mockResponse,
          }),
        }),
      }),
    } as any);

    vi.mocked(prisma.datasetItem.findMany).mockResolvedValue([
      {
        id: "item-123",
        input: { variable1: "test" },
      } as any,
    ]);

    vi.mocked(prisma.llmApiKeys.findFirst).mockResolvedValue({
      key: "test-key",
    } as any);

    vi.mocked(prisma.datasetRunItems.create).mockResolvedValue({
      id: "run-item-123",
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
      expect.any(Object),
      expect.objectContaining({
        tags: ["langfuse:evaluation:llm-as-a-judge"],
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
