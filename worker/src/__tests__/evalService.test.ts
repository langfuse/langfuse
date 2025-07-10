import {
  ApiError,
  LLMAdapter,
  LangfuseNotFoundError,
  variableMappingList,
} from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import {
  convertDateToClickhouseDateTime,
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  upsertObservation,
  upsertTrace,
  checkTraceExists,
  getTraceById,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import Decimal from "decimal.js";
import { sql } from "kysely";
import { afterEach } from "node:test";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { compileHandlebarString } from "../features/utils/utilities";
import { OpenAIServer } from "./network";
import { pruneDatabase } from "./utils";
import {
  createEvalJobs,
  evaluate,
  extractVariablesFromTracingData,
} from "../features/evaluation/evalService";
import { requiresDatabaseLookup } from "../features/evaluation/traceFilterUtils";
let OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const hasActiveKey = Boolean(OPENAI_API_KEY);
if (!hasActiveKey) {
  OPENAI_API_KEY = "sk-test_not_used_as_network_mocks_are_activated";
}
const openAIServer = new OpenAIServer({
  hasActiveKey,
  useDefaultResponse: false,
});
const jobTimestamp = new Date();

beforeAll(openAIServer.setup);
beforeEach(async () => {
  await pruneDatabase();
  openAIServer.respondWithDefault();
});
afterEach(openAIServer.reset);
afterAll(openAIServer.teardown);

describe("eval service tests", () => {
  describe("compile prompt", () => {
    test("compile handlebars template", async () => {
      const template = "Please evaluate toxicity {{input}} {{output}}";
      const compiledString = compileHandlebarString(template, {
        input: "foo",
        output: "bar",
      });
      expect(compiledString).toBe("Please evaluate toxicity foo bar");
    });
  });

  describe("create eval jobs", () => {
    test("creates new 'trace' eval job", async () => {
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          filter: JSON.parse("[]"),
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "trace",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
        },
      });

      const payload = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
      };

      await createEvalJobs({ event: payload, jobTimestamp });

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

    test("creates new 'dataset' eval job", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const datasetId = randomUUID();
      const datasetItemId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await upsertObservation({
        id: observationId,
        trace_id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        type: "GENERATION",
        start_time: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values({
          id: datasetId,
          project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          name: "test-dataset",
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          dataset_id: datasetId,
          source_trace_id: traceId,
          source_observation_id: observationId,
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
          targetObject: "dataset",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
        },
      });

      const payload = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
        datasetItemId: datasetItemId,
        observationId: observationId,
      };

      await createEvalJobs({ event: payload, jobTimestamp });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
      expect(jobs[0].job_input_trace_id).toBe(traceId);
      expect(jobs[0].job_input_observation_id).toBe(observationId);
      expect(jobs[0].job_input_dataset_item_id).toBe(datasetItemId);
      expect(jobs[0].status.toString()).toBe("PENDING");
      expect(jobs[0].start_time).not.toBeNull();
    }, 10_000);

    test("handle dataset upsert with cached traces", async () => {
      const traceId = randomUUID();
      const datasetId = randomUUID();
      const datasetItemId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values({
          id: datasetId,
          project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          name: "test-dataset",
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          dataset_id: datasetId,
          source_trace_id: traceId,
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
          targetObject: "dataset",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
        },
      });

      // Use two job configurations to ensure we're using the cache
      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          filter: [
            {
              type: "string",
              value: "a",
              column: "Dataset",
              operator: "contains",
            },
          ],
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "dataset",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
        },
      });

      const payload = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
        datasetItemId: datasetItemId,
      };

      await createEvalJobs({ event: payload, jobTimestamp });
      // If this does not throw, we're good.
      expect(true).toBe(true);
    });

    test("creates new eval job for a dataset on upsert of the trace", async () => {
      const traceId = randomUUID();
      const datasetId = randomUUID();
      const datasetItemId = randomUUID();
      const datasetRunId = randomUUID();

      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values({
          id: datasetId,
          project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          name: "test-dataset",
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          dataset_id: datasetId,
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_runs")
        .values({
          id: datasetRunId,
          name: randomUUID(),
          dataset_id: datasetId,
          project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_run_items")
        .values({
          id: randomUUID(),
          dataset_item_id: datasetItemId,
          project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          dataset_run_id: datasetRunId,
          trace_id: traceId,
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
          targetObject: "dataset",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
        },
      });

      const payloadDataset = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
        datasetItemId: datasetItemId,
      };

      // This should exit early without an error as there is no trace yet.
      await createEvalJobs({ event: payloadDataset, jobTimestamp });

      const jobsAfterDataset = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .execute();

      // No jobs should have been created.
      expect(jobsAfterDataset.length).toBe(0);

      // Now upsert the trace and validate that the job was created.
      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      const payloadTrace = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
      };

      await createEvalJobs({ event: payloadTrace, jobTimestamp });

      const jobsAfterTrace = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .execute();

      expect(jobsAfterTrace.length).toBe(1);
      expect(jobsAfterTrace[0].project_id).toBe(
        "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      );
      expect(jobsAfterTrace[0].job_input_trace_id).toBe(traceId);
      expect(jobsAfterTrace[0].job_input_dataset_item_id).toBe(datasetItemId);
      expect(jobsAfterTrace[0].status.toString()).toBe("PENDING");
      expect(jobsAfterTrace[0].start_time).not.toBeNull();
    }, 10_000);

    test("creates a new eval job for a dataset only if trace _and_ dataset are available", async () => {
      const traceId = randomUUID();
      const datasetId = randomUUID();
      const datasetItemId = randomUUID();

      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values({
          id: datasetId,
          project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          name: "test-dataset",
        })
        .execute();

      // Create the trace and send the trace event. No job should be created
      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          filter: JSON.parse("[]"),
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "dataset",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
        },
      });

      const payloadTrace = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId,
      };

      // This should exit early without an error as there is no trace yet.
      await createEvalJobs({ event: payloadTrace, jobTimestamp });

      const jobsAfterDataset = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .execute();

      // No jobs should have been created.
      expect(jobsAfterDataset.length).toBe(0);

      // Now, create the dataset item and validate that the job was created.
      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          dataset_id: datasetId,
          source_trace_id: traceId,
        })
        .execute();

      const payloadDataset = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId,
        datasetItemId,
      };

      await createEvalJobs({ event: payloadDataset, jobTimestamp });

      const jobsAfterTrace = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .execute();

      expect(jobsAfterTrace.length).toBe(1);
      expect(jobsAfterTrace[0].project_id).toBe(
        "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      );
      expect(jobsAfterTrace[0].job_input_trace_id).toBe(traceId);
      expect(jobsAfterTrace[0].job_input_dataset_item_id).toBe(datasetItemId);
      expect(jobsAfterTrace[0].status.toString()).toBe("PENDING");
      expect(jobsAfterTrace[0].start_time).not.toBeNull();
    }, 10_000);

    test("does not create job for inactive config", async () => {
      const traceId = randomUUID();

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          filter: JSON.parse("[]"),
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "trace",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
          status: "INACTIVE",
        },
      });

      const payload = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
      };

      await createEvalJobs({ event: payload, jobTimestamp });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);

    test("does not create eval job for existing job execution", async () => {
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

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

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          filter: JSON.parse("[]"),
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "trace",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
        },
      });

      const payload = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
      };

      await createEvalJobs({ event: payload, jobTimestamp });
      await createEvalJobs({ event: payload, jobTimestamp }); // calling it twice to check it is only generated once

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

    test("does not create job for inactive config", async () => {
      const traceId = randomUUID();

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          filter: JSON.parse("[]"),
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "trace",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
          status: "INACTIVE",
        },
      });

      const payload = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
      };

      await createEvalJobs({ event: payload, jobTimestamp });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);

    test("does not create eval job for 0 sample rate", async () => {
      const traceId = randomUUID();

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

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          filter: JSON.parse("[]"),
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("0"),
          targetObject: "trace",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
        },
      });

      const payload = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
      };

      await createEvalJobs({ event: payload, jobTimestamp });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);

    test("cancels a job if the second event deselects", async () => {
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

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
          targetObject: "trace",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
          evalTemplateId: templateId,
        },
      });

      const payload = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
      };

      await createEvalJobs({ event: payload, jobTimestamp });

      // Wait for .5s
      await new Promise((resolve) => setTimeout(resolve, 500));

      // update the trace to deselect the trace
      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await createEvalJobs({
        event: payload,
        jobTimestamp,
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

    test("does not create eval job for existing traces if time scope is EXISTING but handler enforces NEW only", async () => {
      const traceId = randomUUID();

      const trace = createTrace({
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        id: traceId,
      });

      await createTracesCh([trace]);

      const jobConfiguration = await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          filter: JSON.parse("[]"),
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "trace",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
          timeScope: ["EXISTING"],
        },
      });

      // this one should not be selected for eval as it was not provided via the event.
      const jobConfiguration2 = await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          filter: JSON.parse("[]"),
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "trace",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
          timeScope: ["NEW"],
        },
      });

      const payload = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
        configId: jobConfiguration.id,
      };

      await createEvalJobs({
        event: payload,
        jobTimestamp,
        enforcedJobTimeScope: "NEW", // the config must contain NEW
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .where("job_configuration_id", "in", [
          jobConfiguration.id,
          jobConfiguration2.id,
        ])
        .where("job_input_trace_id", "=", traceId)
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);

    test("does create eval for trace which is way in the past if timestamp is provided", async () => {
      const traceId = randomUUID();

      const timestamp = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 1);
      const trace = createTrace({
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        id: traceId,
        timestamp: timestamp.getTime(),
      });

      await createTracesCh([trace]);

      const jobConfiguration = await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          filter: JSON.parse("[]"),
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "trace",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
          timeScope: ["NEW"],
        },
      });

      const payload = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
        configId: jobConfiguration.id,
        timestamp: timestamp,
      };

      await createEvalJobs({
        event: payload,
        jobTimestamp,
        enforcedJobTimeScope: "NEW", // the config must contain NEW
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .where("job_configuration_id", "in", [jobConfiguration.id])
        .where("job_input_trace_id", "=", traceId)
        .execute();

      expect(jobs.length).toBe(1);
    }, 10_000);

    test("does create eval for observation which is way in the past if timestamp is provided", async () => {
      const traceId = randomUUID();

      const timestamp = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 1);
      const trace = createTrace({
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        id: traceId,
        timestamp: timestamp.getTime(),
      });

      const observation = createObservation({
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        id: randomUUID(),
        start_time: timestamp.getTime(),
      });

      await createObservationsCh([observation]);
      await createTracesCh([trace]);

      const jobConfiguration = await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          filter: JSON.parse("[]"),
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "observation",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
          timeScope: ["EXISTING"],
        },
      });

      const payload = {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
        configId: jobConfiguration.id,
        timestamp: timestamp,
        observationId: observation.id,
      };

      await createEvalJobs({
        event: payload,
        jobTimestamp,
        enforcedJobTimeScope: "EXISTING", // the config must contain NEW
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .where("job_configuration_id", "in", [jobConfiguration.id])
        .execute();

      expect(jobs.length).toBe(1);
    }, 10_000);

    test("create eval for trace with timestamp in the near future", async () => {
      const traceId = randomUUID();

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          filter: JSON.parse("[]"),
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "trace",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
          timeScope: ["NEW"],
        },
      });

      const trace = createTrace({
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        id: traceId,
        timestamp: new Date(Date.now() + 1000 * 60 * 60 * 24).getTime(),
      });

      await createTracesCh([trace]);

      await createEvalJobs({
        event: {
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          traceId: traceId,
        },
        jobTimestamp,
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .execute();

      expect(jobs.length).toBe(1);
    }, 10_000);
  });

  describe("execute evals", () => {
    test("evals a valid 'trace' event", async () => {
      openAIServer.respondWithDefault();
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: JSON.stringify({ input: "This is a great prompt" }),
        output: JSON.stringify({ output: "This is a great response" }),
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

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
          targetObject: "trace",
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
        delay: 1000,
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
    }, 50_000);

    test("fails to eval without llm api key", async () => {
      const traceId = randomUUID();

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
          targetObject: "trace",
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
        delay: 1000,
      };

      await expect(evaluate({ event: payload })).rejects.toThrowError(
        new LangfuseNotFoundError(
          `API key for provider "openai" not found in project 7a88fb47-b4e2-43b8-a06c-a5ce950dc53a.`,
        ),
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

    test("fails to eval on openai error", async () => {
      openAIServer.respondWithError(401, "Not authorized");

      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: JSON.stringify({ input: "This is a great prompt" }),
        output: JSON.stringify({ output: "This is a great response" }),
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

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
          targetObject: "trace",
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
        delay: 1000,
      };

      await expect(evaluate({ event: payload })).rejects.toThrowError(
        new ApiError(
          "Failed to call LLM: Error: 401 status code (no body)\n" +
            "\n" +
            "Troubleshooting URL: https://js.langchain.com/docs/troubleshooting/errors/MODEL_AUTHENTICATION/\n",
          401,
        ),
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
      const traceId = randomUUID();

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
          targetObject: "trace",
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
        delay: 1000,
      };

      await evaluate({ event: payload });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);

    test("evals a valid 'trace' event and inserts score to ingestion pipeline", async () => {
      openAIServer.respondWithDefault();
      const traceId = randomUUID();

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
          targetObject: "trace",
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
        delay: 1000,
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
    }, 20_000);
  });

  describe("test variable extraction", () => {
    test("extracts variables from a dataset item", async () => {
      const datasetId = randomUUID();
      const datasetItemId = randomUUID();
      const traceId = randomUUID();

      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values({
          id: datasetId,
          project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          name: "test-dataset",
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          input: { input: "This is a great prompt" },
          expected_output: { expected_output: "This is a great response" },
          project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          dataset_id: datasetId,
        })
        .execute();

      const variableMapping = variableMappingList.parse([
        {
          langfuseObject: "dataset_item",
          selectedColumnId: "input",
          templateVariable: "input",
        },
        {
          langfuseObject: "dataset_item",
          selectedColumnId: "expected_output",
          templateVariable: "output",
        },
      ]);

      const result = await extractVariablesFromTracingData({
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        variables: ["input", "output"],
        traceId: traceId,
        datasetItemId: datasetItemId,
        variableMapping: variableMapping,
      });

      expect(result).toEqual([
        {
          value: '{"input":"This is a great prompt"}',
          var: "input",
        },
        {
          value: '{"expected_output":"This is a great response"}',
          var: "output",
        },
      ]);
    }, 10_000);

    test("extracts variables from a trace", async () => {
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        environment: "production",
        input: JSON.stringify({ input: "This is a great prompt" }),
        output: JSON.stringify({ output: "This is a great response" }),
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

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

      const result = await extractVariablesFromTracingData({
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        variables: ["input", "output"],
        traceId: traceId,
        variableMapping: variableMapping,
      });

      expect(result).toEqual([
        {
          value: '{"input":"This is a great prompt"}',
          var: "input",
          environment: "production",
        },
        {
          value: '{"output":"This is a great response"}',
          var: "output",
          environment: "production",
        },
      ]);
    }, 10_000);

    test("extracts variables from a observation", async () => {
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: JSON.stringify({ input: "This is a great prompt" }),
        output: JSON.stringify({ output: "This is a great response" }),
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await upsertObservation({
        id: randomUUID(),
        trace_id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        name: "great-llm-name",
        type: "GENERATION",
        environment: "production",
        input: JSON.stringify({ huhu: "This is a great prompt" }),
        output: JSON.stringify({ haha: "This is a great response" }),
        start_time: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

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

      const result = await extractVariablesFromTracingData({
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        variables: ["input", "output"],
        traceId: traceId,
        variableMapping: variableMapping,
      });

      expect(result).toEqual([
        {
          value: '{"huhu":"This is a great prompt"}',
          var: "input",
          environment: "production",
        },
        {
          value: '{"haha":"This is a great response"}',
          var: "output",
          environment: "production",
        },
      ]);
    }, 10_000);

    test("fails if observation is not present", async () => {
      const traceId = randomUUID();

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
        extractVariablesFromTracingData({
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          variables: ["input", "output"],
          traceId: traceId,
          variableMapping: variableMapping,
        }),
      ).rejects.toThrowError(
        new LangfuseNotFoundError(
          `Observation great-llm-name for trace ${traceId} not found. Please ensure the mapped data exists and consider extending the job delay.`,
        ),
      );
    }, 10_000);

    test("does not fail if observation data is null", async () => {
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: JSON.stringify({ input: "This is a great prompt" }),
        output: JSON.stringify({ output: "This is a great response" }),
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      // fetching input and output for an observation which has NULL values
      await upsertObservation({
        id: randomUUID(),
        trace_id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        name: "great-llm-name",
        type: "GENERATION",
        start_time: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

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

      const result = await extractVariablesFromTracingData({
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        variables: ["input", "output"],
        traceId: traceId,
        variableMapping: variableMapping,
      });

      expect(result).toEqual([
        {
          environment: "default",
          value: "",
          var: "input",
        },
        {
          environment: "default",
          value: "",
          var: "output",
        },
      ]);
    }, 10_000);

    test("extracts variables from a youngest observation", async () => {
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        user_id: "a",
        input: JSON.stringify({ input: "This is a great prompt" }),
        output: JSON.stringify({ output: "This is a great response" }),
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await upsertObservation({
        id: randomUUID(),
        trace_id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        name: "great-llm-name",
        type: "GENERATION",
        input: JSON.stringify({ huhu: "This is a great prompt" }),
        output: JSON.stringify({ haha: "This is a great response" }),
        start_time: convertDateToClickhouseDateTime(
          new Date("2022-01-01T00:00:00.000Z"),
        ),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await upsertObservation({
        id: randomUUID(),
        trace_id: traceId,
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        name: "great-llm-name",
        type: "GENERATION",
        input: JSON.stringify({ huhu: "This is a great prompt again" }),
        output: JSON.stringify({ haha: "This is a great response again" }),
        start_time: convertDateToClickhouseDateTime(
          new Date("2022-01-02T00:00:00.000Z"),
        ),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

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

      const result = await extractVariablesFromTracingData({
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        variables: ["input", "output"],
        traceId: traceId,
        variableMapping: variableMapping,
      });

      expect(result).toEqual([
        {
          environment: "default",
          value: '{"huhu":"This is a great prompt again"}',
          var: "input",
        },
        {
          environment: "default",
          value: '{"haha":"This is a great response again"}',
          var: "output",
        },
      ]);
    }, 10_000);
  });

  test("requiresDatabaseLookup correctly identifies complex filters", () => {
    // Simple filters that can be evaluated with trace data only
    const simpleFilters = [
      { column: "name", type: "string", operator: "=", value: "test-trace" },
      {
        column: "environment",
        type: "string",
        operator: "=",
        value: "production",
      },
      { column: "bookmarked", type: "boolean", operator: "=", value: true },
    ];

    expect(!requiresDatabaseLookup(simpleFilters)).toBe(true);

    // Complex filters that require observation data
    const complexFilters = [
      { column: "level", type: "string", operator: "=", value: "ERROR" },
    ];

    expect(!requiresDatabaseLookup(complexFilters)).toBe(false);

    // Mixed filters - should return false if any filter requires observation data
    const mixedFilters = [
      { column: "name", type: "string", operator: "=", value: "test-trace" },
      { column: "level", type: "string", operator: "=", value: "ERROR" }, // This requires observation data
    ];

    expect(!requiresDatabaseLookup(mixedFilters)).toBe(false);
  });
});
