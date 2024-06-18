import { expect, test, describe, vi, afterAll, beforeAll } from "vitest";
import {
  createEvalJobs,
  evaluate,
  extractVariablesFromTrace,
} from "../features/evaluation/eval-service";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";
import Decimal from "decimal.js";
import { pruneDatabase } from "./utils";
import { sql } from "kysely";
import {
  LLMAdapter,
  LangfuseNotFoundError,
  variableMappingList,
} from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { OpenAIServer } from "./network";
import { afterEach } from "node:test";

vi.mock("../redis/consumer", () => ({
  evalQueue: {
    add: vi.fn().mockImplementation((jobName, jobData) => {
      console.log(
        `Mock evalQueue.add called with jobName: ${jobName} and jobData:`,
        jobData
      );
      // Simulate the job being processed immediately by calling the job's processing function
      // Note: You would replace `processJobFunction` with the actual function that processes the job
      // For example, if `createEvalJobs` is the function that should be called, you would use it here
      // processJobFunction({ data: jobData.payload });
    }),
  },
}));

let OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const hasActiveKey = Boolean(OPENAI_API_KEY);
if (!hasActiveKey) {
  OPENAI_API_KEY = "sk-test_not_used_as_network_mocks_are_activated";
}
const openAIServer = new OpenAIServer({
  hasActiveKey,
  useDefaultResponse: false,
});

beforeAll(openAIServer.setup);
afterEach(openAIServer.reset);
afterAll(openAIServer.teardown);

describe("create eval jobs", () => {
  test("creates new eval job", async () => {
    await pruneDatabase();
    const traceId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("traces")
      .values({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      })
      .execute();

    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        filter: JSON.parse("[]"),
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "traces",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
      },
    });

    const payload = {
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      traceId: traceId,
    };

    await createEvalJobs({ event: payload });

    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(jobs[0].job_input_trace_id).toBe(traceId);
    expect(jobs[0].status.toString()).toBe("PENDING");
    expect(jobs[0].start_time).not.toBeNull();
  }, 10_000);

  test("does not create job for inactive config", async () => {
    await pruneDatabase();
    const traceId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("traces")
      .values({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      })
      .execute();

    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        filter: JSON.parse("[]"),
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "traces",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        status: "INACTIVE",
      },
    });

    const payload = {
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      traceId: traceId,
    };

    await createEvalJobs({ event: payload });

    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
      .execute();

    expect(jobs.length).toBe(0);
  }, 10_000);

  test("does not create eval job for existing job execution", async () => {
    await pruneDatabase();
    const traceId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("traces")
      .values({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      })
      .execute();

    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        filter: JSON.parse("[]"),
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "traces",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
      },
    });

    const payload = {
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      traceId: traceId,
    };

    await createEvalJobs({ event: payload });
    await createEvalJobs({ event: payload }); // calling it twice to check it is only generated once

    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(jobs[0].job_input_trace_id).toBe(traceId);
    expect(jobs[0].status.toString()).toBe("PENDING");
    expect(jobs[0].start_time).not.toBeNull();
    expect(jobs[0].end_time).to.be.null;
  }, 10_000);

  test("cancels a job if the second event deselects", async () => {
    await pruneDatabase();
    const traceId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("traces")
      .values({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
      })
      .execute();

    const templateId = randomUUID();
    await kyselyPrisma.$kysely
      .insertInto("eval_templates")
      .values({
        id: templateId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        name: "test-template",
        version: 1,
        prompt: "Please evaluate toxicity {{input}} {{output}}",
        model: "gpt-3.5-turbo",
        provider: "openai",
        model_params: {},
        output_schema: {
          reasoning: "Please explain your reasoning",
          score: "Please provide a score between 0 and 1",
        },
      })
      .executeTakeFirst();

    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        filter: [
          {
            type: "string",
            value: "a",
            column: "User ID",
            operator: "contains",
          },
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "traces",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: templateId,
      },
    });

    const payload = {
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      traceId: traceId,
    };

    await createEvalJobs({ event: payload });

    // update the trace to deselect the trace
    await kyselyPrisma.$kysely
      .updateTable("traces")
      .set("user_id", "b")
      .where("id", "=", traceId)
      .execute();

    await createEvalJobs({
      event: payload,
    }); // calling it twice to check it is only generated once

    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(jobs[0].job_input_trace_id).toBe(traceId);
    expect(jobs[0].status.toString()).toBe("CANCELLED");
    expect(jobs[0].start_time).not.toBeNull();
    expect(jobs[0].end_time).not.toBeNull();
  }, 10_000);
});

describe("execute evals", () => {
  test("evals a valid event", async () => {
    await pruneDatabase();
    openAIServer.respondWithDefault();
    const traceId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("traces")
      .values({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: { input: "This is a great prompt" },
        output: { output: "This is a great response" },
      })
      .execute();

    const templateId = randomUUID();
    await kyselyPrisma.$kysely
      .insertInto("eval_templates")
      .values({
        id: templateId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        name: "test-template",
        version: 1,
        prompt: "Please evaluate toxicity {{input}} {{output}}",
        model: "gpt-3.5-turbo",
        provider: "openai",
        model_params: {},
        output_schema: {
          reasoning: "Please explain your reasoning",
          score: "Please provide a score between 0 and 1",
        },
      })
      .executeTakeFirst();

    const jobConfiguration = await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        filter: [
          {
            type: "string",
            value: "a",
            column: "User ID",
            operator: "contains",
          },
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "traces",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: templateId,
      },
    });

    const jobExecutionId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("job_executions")
      .values({
        id: jobExecutionId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        job_configuration_id: jobConfiguration.id,
        status: sql`'PENDING'::"JobExecutionStatus"`,
        start_time: new Date(),
        job_input_trace_id: traceId,
      })
      .execute();

    await kyselyPrisma.$kysely
      .insertInto("llm_api_keys")
      .values({
        id: randomUUID(),
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        secret_key: encrypt(String(OPENAI_API_KEY)),
        provider: "openai",
        adapter: LLMAdapter.OpenAI,
        custom_models: [],
        display_secret_key: "123456",
      })
      .execute();

    const payload = {
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      jobExecutionId: jobExecutionId,
    };

    await evaluate({ event: payload });

    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(jobs[0].job_input_trace_id).toBe(traceId);
    expect(jobs[0].status.toString()).toBe("COMPLETED");
    expect(jobs[0].start_time).not.toBeNull();
    expect(jobs[0].end_time).not.toBeNull();

    const scores = await kyselyPrisma.$kysely
      .selectFrom("scores")
      .selectAll()
      .where("trace_id", "=", traceId)
      .execute();

    expect(scores.length).toBe(1);
    expect(scores[0].trace_id).toBe(traceId);
    expect(scores[0].comment).not.toBeNull();
    expect(scores[0].project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
  }, 10_000);

  test("fails to eval without llm api key", async () => {
    await pruneDatabase();
    const traceId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("traces")
      .values({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: { input: "This is a great prompt" },
        output: { output: "This is a great response" },
      })
      .execute();

    const templateId = randomUUID();
    await kyselyPrisma.$kysely
      .insertInto("eval_templates")
      .values({
        id: templateId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        name: "test-template",
        version: 1,
        prompt: "Please evaluate toxicity {{input}} {{output}}",
        model: "gpt-3.5-turbo",
        provider: "openai",
        model_params: {},
        output_schema: {
          reasoning: "Please explain your reasoning",
          score: "Please provide a score between 0 and 1",
        },
      })
      .executeTakeFirst();

    const jobConfiguration = await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        filter: [
          {
            type: "string",
            value: "a",
            column: "User ID",
            operator: "contains",
          },
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "traces",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: templateId,
      },
    });

    const jobExecutionId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("job_executions")
      .values({
        id: jobExecutionId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        job_configuration_id: jobConfiguration.id,
        status: sql`'PENDING'::"JobExecutionStatus"`,
        start_time: new Date(),
        job_input_trace_id: traceId,
      })
      .execute();

    const payload = {
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      jobExecutionId: jobExecutionId,
    };

    await expect(evaluate({ event: payload })).rejects.toThrowError(
      new LangfuseNotFoundError(
        "API key for provider openai and project 7a88fb47-b4e2-43b8-a06c-a5ce950dc53a not found."
      )
    );

    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(jobs[0].job_input_trace_id).toBe(traceId);
    // the job will be failed when the exception is caught in the worker consumer
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("evals should cancel if job is cancelled", async () => {
    await pruneDatabase();
    const traceId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("traces")
      .values({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: { input: "This is a great prompt" },
        output: { output: "This is a great response" },
      })
      .execute();

    const templateId = randomUUID();
    await kyselyPrisma.$kysely
      .insertInto("eval_templates")
      .values({
        id: templateId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        name: "test-template",
        version: 1,
        prompt: "Please evaluate toxicity {{input}} {{output}}",
        model: "gpt-3.5-turbo",
        provider: "openai",
        model_params: {},
        output_schema: {
          reasoning: "Please explain your reasoning",
          score: "Please provide a score between 0 and 1",
        },
      })
      .executeTakeFirst();

    const jobConfiguration = await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        filter: [
          {
            type: "string",
            value: "a",
            column: "User ID",
            operator: "contains",
          },
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "traces",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: templateId,
      },
    });

    const jobExecutionId = randomUUID();
    await kyselyPrisma.$kysely
      .insertInto("job_executions")
      .values({
        id: jobExecutionId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        job_configuration_id: jobConfiguration.id,
        status: sql`'CANCELLED'::"JobExecutionStatus"`,
        start_time: new Date(),
        job_input_trace_id: traceId,
      })
      .execute();

    const payload = {
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      jobExecutionId: jobExecutionId,
    };

    await evaluate({ event: payload });

    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
      .execute();

    expect(jobs.length).toBe(0);
  }, 10_000);
});

describe("test variable extraction", () => {
  test("extracts variables from a trace", async () => {
    await pruneDatabase();
    const traceId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("traces")
      .values({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: { input: "This is a great prompt" },
        output: { output: "This is a great response" },
      })
      .execute();

    const variableMapping = variableMappingList.parse([
      {
        langfuseObject: "trace",
        selectedColumnId: "input",
        templateVariable: "input",
      },
      {
        langfuseObject: "trace",
        selectedColumnId: "output",
        templateVariable: "output",
      },
    ]);

    const result = await extractVariablesFromTrace(
      "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      ["input", "output"],
      traceId,
      variableMapping
    );

    expect(result).toEqual([
      {
        value: '{"input":"This is a great prompt"}',
        var: "input",
      },
      {
        value: '{"output":"This is a great response"}',
        var: "output",
      },
    ]);
  }, 10_000);

  test("extracts variables from a observation", async () => {
    await pruneDatabase();
    const traceId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("traces")
      .values({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: { input: "This is a great prompt" },
        output: { output: "This is a great response" },
      })
      .execute();

    await kyselyPrisma.$kysely
      .insertInto("observations")
      .values({
        id: randomUUID(),
        trace_id: traceId,
        name: "great-llm-name",
        type: sql`'GENERATION'::"ObservationType"`,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        input: { huhu: "This is a great prompt" },
        output: { haha: "This is a great response" },
      })
      .execute();

    const variableMapping = variableMappingList.parse([
      {
        langfuseObject: "generation",
        selectedColumnId: "input",
        templateVariable: "input",
        objectName: "great-llm-name",
      },
      {
        langfuseObject: "generation",
        selectedColumnId: "output",
        templateVariable: "output",
        objectName: "great-llm-name",
      },
    ]);

    const result = await extractVariablesFromTrace(
      "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      ["input", "output"],
      traceId,
      variableMapping
    );

    expect(result).toEqual([
      {
        value: '{"huhu":"This is a great prompt"}',
        var: "input",
      },
      {
        value: '{"haha":"This is a great response"}',
        var: "output",
      },
    ]);
  }, 10_000);

  test("fails if observation is not present", async () => {
    await pruneDatabase();
    const traceId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("traces")
      .values({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: { input: "This is a great prompt" },
        output: { output: "This is a great response" },
      })
      .execute();

    const variableMapping = variableMappingList.parse([
      {
        langfuseObject: "generation",
        selectedColumnId: "input",
        templateVariable: "input",
        objectName: "great-llm-name",
      },
      {
        langfuseObject: "generation",
        selectedColumnId: "output",
        templateVariable: "output",
        objectName: "great-llm-name",
      },
    ]);

    await expect(
      extractVariablesFromTrace(
        "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        ["input", "output"],
        traceId,
        variableMapping
      )
    ).rejects.toThrowError(
      new LangfuseNotFoundError(
        `Observation great-llm-name for trace ${traceId} not found. Please ensure the mapped data exists and consider extending the job delay.`
      )
    );
  }, 10_000);

  test("does not fail if observation data is null", async () => {
    await pruneDatabase();
    const traceId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("traces")
      .values({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: { input: "This is a great prompt" },
        output: { output: "This is a great response" },
      })
      .execute();

    // fetching input and output for an observation which has NULL values
    await kyselyPrisma.$kysely
      .insertInto("observations")
      .values({
        id: randomUUID(),
        trace_id: traceId,
        name: "great-llm-name",
        type: sql`'GENERATION'::"ObservationType"`,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      })
      .execute();

    const variableMapping = variableMappingList.parse([
      {
        langfuseObject: "generation",
        selectedColumnId: "input",
        templateVariable: "input",
        objectName: "great-llm-name",
      },
      {
        langfuseObject: "generation",
        selectedColumnId: "output",
        templateVariable: "output",
        objectName: "great-llm-name",
      },
    ]);

    const result = await extractVariablesFromTrace(
      "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      ["input", "output"],
      traceId,
      variableMapping
    );

    expect(result).toEqual([
      {
        value: "",
        var: "input",
      },
      {
        value: "",
        var: "output",
      },
    ]);
  }, 10_000);

  test("extracts variables from a youngest observation", async () => {
    await pruneDatabase();
    const traceId = randomUUID();

    await kyselyPrisma.$kysely
      .insertInto("traces")
      .values({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: { input: "This is a great prompt" },
        output: { output: "This is a great response" },
      })
      .execute();

    await kyselyPrisma.$kysely
      .insertInto("observations")
      .values({
        id: randomUUID(),
        trace_id: traceId,
        name: "great-llm-name",
        start_time: new Date("2022-01-01T00:00:00.000Z"),
        type: sql`'GENERATION'::"ObservationType"`,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        input: { huhu: "This is a great prompt" },
        output: { haha: "This is a great response" },
      })
      .execute();
    await kyselyPrisma.$kysely
      .insertInto("observations")
      .values({
        id: randomUUID(),
        trace_id: traceId,
        name: "great-llm-name",
        start_time: new Date("2022-01-02T00:00:00.000Z"),
        type: sql`'GENERATION'::"ObservationType"`,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        input: { huhu: "This is a great prompt again" },
        output: { haha: "This is a great response again" },
      })
      .execute();

    const variableMapping = variableMappingList.parse([
      {
        langfuseObject: "generation",
        selectedColumnId: "input",
        templateVariable: "input",
        objectName: "great-llm-name",
      },
      {
        langfuseObject: "generation",
        selectedColumnId: "output",
        templateVariable: "output",
        objectName: "great-llm-name",
      },
    ]);

    const result = await extractVariablesFromTrace(
      "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      ["input", "output"],
      traceId,
      variableMapping
    );

    expect(result).toEqual([
      {
        value: '{"huhu":"This is a great prompt again"}',
        var: "input",
      },
      {
        value: '{"haha":"This is a great response again"}',
        var: "output",
      },
    ]);
  }, 10_000);
});
