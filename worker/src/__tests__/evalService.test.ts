import {
  ApiError,
  LLMAdapter,
  ObservationType,
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
  createDatasetRunItemsCh,
  createDatasetRunItem,
  createOrgProjectAndApiKey,
  LLMCompletionError,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import Decimal from "decimal.js";
import { sql } from "kysely";
import { afterEach } from "node:test";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { compileHandlebarString } from "../features/utils/utilities";
import { OpenAIServer } from "./network";
import {
  createEvalJobs,
  evaluate,
  extractVariablesFromTracingData,
} from "../features/evaluation/evalService";
import { requiresDatabaseLookup } from "../features/evaluation/traceFilterUtils";

// Mock fetchLLMCompletion module with default passthrough behavior
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    fetchLLMCompletion: vi
      .fn()
      .mockImplementation(actual.fetchLLMCompletion as any),
  };
});

// Import the mocked function
import { fetchLLMCompletion } from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../errors/UnrecoverableError";

let OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Check for both OPENAI_API_KEY and LANGFUSE_LLM_CONNECTION_OPENAI_KEY
// to avoid interfering with llmConnections tests that use the latter
const hasActiveKey = Boolean(
  OPENAI_API_KEY || process.env.LANGFUSE_LLM_CONNECTION_OPENAI_KEY,
);
if (!hasActiveKey) {
  OPENAI_API_KEY = "sk-test_not_used_as_network_mocks_are_activated";
}
const openAIServer = new OpenAIServer({
  hasActiveKey,
  useDefaultResponse: false,
});
const jobTimestamp = new Date();

beforeAll(openAIServer.setup);
beforeAll(async () => {
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
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId: traceId,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].project_id).toBe(projectId);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
      expect(jobs[0].status.toString()).toBe("PENDING");
      expect(jobs[0].start_time).not.toBeNull();
    }, 10_000);

    test("creates new 'dataset' eval job", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();
      const observationId = randomUUID();
      const datasetId = randomUUID();
      const datasetItemId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await upsertObservation({
        id: observationId,
        trace_id: traceId,
        project_id: projectId,
        type: "GENERATION",
        start_time: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values({
          id: datasetId,
          project_id: projectId,
          name: "test-dataset",
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          project_id: projectId,
          dataset_id: datasetId,
          source_trace_id: traceId,
          source_observation_id: observationId,
        })
        .execute();

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId: traceId,
        datasetItemId: datasetItemId,
        observationId: observationId,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].project_id).toBe(projectId);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
      expect(jobs[0].job_input_observation_id).toBe(observationId);
      expect(jobs[0].job_input_dataset_item_id).toBe(datasetItemId);
      expect(jobs[0].status.toString()).toBe("PENDING");
      expect(jobs[0].start_time).not.toBeNull();
    }, 10_000);

    test("handle dataset upsert with cached traces", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();
      const datasetId = randomUUID();
      const datasetItemId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values({
          id: datasetId,
          project_id: projectId,
          name: "test-dataset",
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          project_id: projectId,
          dataset_id: datasetId,
          source_trace_id: traceId,
        })
        .execute();

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
          projectId,
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
        projectId,
        traceId: traceId,
        datasetItemId: datasetItemId,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });
      // If this does not throw, we're good.
      expect(true).toBe(true);
    });

    test("creates new eval job for a dataset on upsert of the trace", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();
      const datasetId = randomUUID();
      const datasetItemId = randomUUID();
      const datasetRunId = randomUUID();

      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values({
          id: datasetId,
          project_id: projectId,
          name: "test-dataset",
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          project_id: projectId,
          dataset_id: datasetId,
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_runs")
        .values({
          id: datasetRunId,
          name: randomUUID(),
          dataset_id: datasetId,
          project_id: projectId,
        })
        .execute();

      // Create a clickhouse run item
      await createDatasetRunItemsCh([
        createDatasetRunItem({
          project_id: projectId,
          dataset_id: datasetId,
          dataset_run_id: datasetRunId,
          dataset_item_id: datasetItemId,
          trace_id: traceId,
        }),
      ]);

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId: traceId,
        datasetItemId: datasetItemId,
      };

      // This should exit early without an error as there is no trace yet.
      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payloadDataset,
        jobTimestamp,
      });

      const jobsAfterDataset = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      // No jobs should have been created.
      expect(jobsAfterDataset.length).toBe(0);

      // Now upsert the trace and validate that the job was created.
      await upsertTrace({
        id: traceId,
        project_id: projectId,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      const payloadTrace = {
        projectId,
        traceId: traceId,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payloadTrace,
        jobTimestamp,
      });

      const jobsAfterTrace = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobsAfterTrace.length).toBe(1);
      expect(jobsAfterTrace[0].project_id).toBe(projectId);
      expect(jobsAfterTrace[0].job_input_trace_id).toBe(traceId);
      expect(jobsAfterTrace[0].job_input_dataset_item_id).toBe(datasetItemId);
      expect(jobsAfterTrace[0].status.toString()).toBe("PENDING");
      expect(jobsAfterTrace[0].start_time).not.toBeNull();
    }, 10_000);

    test("creates a new eval job for a dataset only if trace _and_ dataset are available", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();
      const datasetId = randomUUID();
      const datasetItemId = randomUUID();

      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values({
          id: datasetId,
          project_id: projectId,
          name: "test-dataset",
        })
        .execute();

      // Create the trace and send the trace event. No job should be created
      await upsertTrace({
        id: traceId,
        project_id: projectId,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId,
      };

      // This should exit early without an error as there is no trace yet.
      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payloadTrace,
        jobTimestamp,
      });

      const jobsAfterDataset = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      // No jobs should have been created.
      expect(jobsAfterDataset.length).toBe(0);

      // Now, create the dataset item and validate that the job was created.
      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          project_id: projectId,
          dataset_id: datasetId,
          source_trace_id: traceId,
        })
        .execute();

      const payloadDataset = {
        projectId,
        traceId,
        datasetItemId,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payloadDataset,
        jobTimestamp,
      });

      const jobsAfterTrace = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobsAfterTrace.length).toBe(1);
      expect(jobsAfterTrace[0].project_id).toBe(projectId);
      expect(jobsAfterTrace[0].job_input_trace_id).toBe(traceId);
      expect(jobsAfterTrace[0].job_input_dataset_item_id).toBe(datasetItemId);
      expect(jobsAfterTrace[0].status.toString()).toBe("PENDING");
      expect(jobsAfterTrace[0].start_time).not.toBeNull();
    }, 10_000);

    test("does not create job for inactive config", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId: traceId,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);

    test("does not create eval job for existing job execution", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await kyselyPrisma.$kysely
        .insertInto("llm_api_keys")
        .values({
          id: randomUUID(),
          project_id: projectId,
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
          projectId,
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
        projectId,
        traceId: traceId,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });
      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      }); // calling it twice to check it is only generated once

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].project_id).toBe(projectId);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
      expect(jobs[0].status.toString()).toBe("PENDING");
      expect(jobs[0].start_time).not.toBeNull();
      expect(jobs[0].end_time).to.be.null;
    }, 10_000);

    test("does not create job for inactive config", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId: traceId,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);

    test("does not create eval job for 0 sample rate", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      await kyselyPrisma.$kysely
        .insertInto("llm_api_keys")
        .values({
          id: randomUUID(),
          project_id: projectId,
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
          projectId,
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
        projectId,
        traceId: traceId,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);

    test("cancels a job if the second event deselects", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
        user_id: "a",
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await kyselyPrisma.$kysely
        .insertInto("llm_api_keys")
        .values({
          id: randomUUID(),
          project_id: projectId,
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
          project_id: projectId,
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
          projectId,
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
        projectId,
        traceId: traceId,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });

      // Wait for .5s
      await new Promise((resolve) => setTimeout(resolve, 500));

      // update the trace to deselect the trace
      await upsertTrace({
        id: traceId,
        project_id: projectId,
        user_id: "b",
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      }); // calling it twice to check it is only generated once

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].project_id).toBe(projectId);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
      expect(jobs[0].status.toString()).toBe("CANCELLED");
      expect(jobs[0].start_time).not.toBeNull();
      expect(jobs[0].end_time).not.toBeNull();
    }, 10_000);

    test("does not create eval job for existing traces if time scope is EXISTING but handler enforces NEW only", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      const trace = createTrace({
        project_id: projectId,
        id: traceId,
      });

      await createTracesCh([trace]);

      const jobConfiguration = await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
          projectId,
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
        projectId,
        traceId: traceId,
        configId: jobConfiguration.id,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
        enforcedJobTimeScope: "NEW", // the config must contain NEW
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .where("job_configuration_id", "in", [
          jobConfiguration.id,
          jobConfiguration2.id,
        ])
        .where("job_input_trace_id", "=", traceId)
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);

    test("does create eval for trace which is way in the past if timestamp is provided", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      const timestamp = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 1);
      const trace = createTrace({
        project_id: projectId,
        id: traceId,
        timestamp: timestamp.getTime(),
      });

      await createTracesCh([trace]);

      const jobConfiguration = await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId: traceId,
        configId: jobConfiguration.id,
        timestamp: timestamp,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
        enforcedJobTimeScope: "NEW", // the config must contain NEW
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .where("job_configuration_id", "in", [jobConfiguration.id])
        .where("job_input_trace_id", "=", traceId)
        .execute();

      expect(jobs.length).toBe(1);
    }, 10_000);

    test("does create eval for observation which is way in the past if timestamp is provided", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      const timestamp = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 1);
      const trace = createTrace({
        project_id: projectId,
        id: traceId,
        timestamp: timestamp.getTime(),
      });

      const observation = createObservation({
        project_id: projectId,
        id: randomUUID(),
        start_time: timestamp.getTime(),
      });

      await createObservationsCh([observation]);
      await createTracesCh([trace]);

      const jobConfiguration = await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId: traceId,
        configId: jobConfiguration.id,
        timestamp: timestamp,
        observationId: observation.id,
      };

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
        enforcedJobTimeScope: "EXISTING", // the config must contain NEW
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .where("job_configuration_id", "in", [jobConfiguration.id])
        .execute();

      expect(jobs.length).toBe(1);
    }, 10_000);

    test("create eval for trace with timestamp in the near future", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        project_id: projectId,
        id: traceId,
        timestamp: new Date(Date.now() + 1000 * 60 * 60 * 24).getTime(),
      });

      await createTracesCh([trace]);

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: {
          projectId,
          traceId: traceId,
        },
        jobTimestamp,
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
    }, 10_000);

    test("creates dataset eval job with cached dataset item filtering - positive match", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();
      const datasetId1 = randomUUID();
      const datasetId2 = randomUUID();
      const datasetId3 = randomUUID();
      const datasetRunId = randomUUID();
      const datasetItemId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      // Create three datasets
      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values([
          {
            id: datasetId1,
            project_id: projectId,
            name: "dataset-alpha",
          },
          {
            id: datasetId2,
            project_id: projectId,
            name: "dataset-beta",
          },
          {
            id: datasetId3,
            project_id: projectId,
            name: "dataset-gamma",
          },
        ])
        .execute();

      // Create dataset item that matches the second dataset filter
      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          project_id: projectId,
          dataset_id: datasetId2,
          source_trace_id: traceId,
        })
        .execute();

      // Used if ClickHouse reads are disabled.
      await kyselyPrisma.$kysely
        .insertInto("dataset_runs")
        .values({
          id: datasetRunId,
          project_id: projectId,
          name: randomUUID(),
          dataset_id: datasetId2,
        })
        .execute();

      // Create a clickhouse run item that references dataset 2 and the new trace.
      await createDatasetRunItemsCh([
        createDatasetRunItem({
          project_id: projectId,
          dataset_id: datasetId2,
          dataset_item_id: datasetItemId,
          trace_id: traceId,
        }),
      ]);

      // Create three job configurations, each filtering for a specific dataset
      await prisma.jobConfiguration.createMany({
        data: [
          {
            id: randomUUID(),
            projectId,
            filter: [
              {
                type: "stringOptions",
                value: [datasetId1],
                column: "Dataset",
                operator: "any of",
              },
            ],
            jobType: "EVAL",
            delay: 0,
            sampling: new Decimal("1"),
            targetObject: "dataset",
            scoreName: "score-alpha",
            variableMapping: JSON.parse("[]"),
          },
          {
            id: randomUUID(),
            projectId,
            filter: [
              {
                type: "stringOptions",
                value: [datasetId2],
                column: "Dataset",
                operator: "any of",
              },
            ],
            jobType: "EVAL",
            delay: 0,
            sampling: new Decimal("1"),
            targetObject: "dataset",
            scoreName: "score-beta",
            variableMapping: JSON.parse("[]"),
          },
          {
            id: randomUUID(),
            projectId,
            filter: [
              {
                type: "stringOptions",
                value: [datasetId3],
                column: "Dataset",
                operator: "any of",
              },
            ],
            jobType: "EVAL",
            delay: 0,
            sampling: new Decimal("1"),
            targetObject: "dataset",
            scoreName: "score-gamma",
            variableMapping: JSON.parse("[]"),
          },
        ],
      });

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: {
          projectId,
          traceId,
        },
        jobTimestamp,
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      // Should create exactly one job for the matching dataset (dataset-beta)
      expect(jobs.length).toBe(1);
      expect(jobs[0].project_id).toBe(projectId);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
      expect(jobs[0].job_input_dataset_item_id).toBe(datasetItemId);
      expect(jobs[0].status.toString()).toBe("PENDING");

      // Verify it's the correct config by checking the score name
      const config = await kyselyPrisma.$kysely
        .selectFrom("job_configurations")
        .select("score_name")
        .where("id", "=", jobs[0].job_configuration_id)
        .executeTakeFirstOrThrow();

      expect(config.score_name).toBe("score-beta");
    }, 10_000);

    test("creates no dataset eval jobs with cached dataset item filtering - negative match", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();
      const datasetId1 = randomUUID();
      const datasetId2 = randomUUID();
      const datasetItemId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      // Create four datasets
      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values([
          {
            id: datasetId1,
            project_id: projectId,
            name: "dataset-alpha",
          },
          {
            id: datasetId2,
            project_id: projectId,
            name: "dataset-beta",
          },
        ])
        .execute();

      // Create dataset item that matches none of the config filters (dataset-delta)
      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          project_id: projectId,
          dataset_id: datasetId1,
          source_trace_id: traceId,
        })
        .execute();

      // Create a clickhouse run item that references a non-existing dataset and the new trace.
      await createDatasetRunItemsCh([
        createDatasetRunItem({
          dataset_id: randomUUID(),
          dataset_item_id: datasetItemId,
          trace_id: traceId,
        }),
      ]);

      // Create three job configurations, each filtering for specific datasets (but not delta)
      await prisma.jobConfiguration.createMany({
        data: [
          {
            id: randomUUID(),
            projectId,
            filter: [
              {
                type: "stringOptions",
                value: [datasetId1],
                column: "Dataset",
                operator: "any of",
              },
            ],
            jobType: "EVAL",
            delay: 0,
            sampling: new Decimal("1"),
            targetObject: "dataset",
            scoreName: "score-alpha",
            variableMapping: JSON.parse("[]"),
          },
          {
            id: randomUUID(),
            projectId,
            filter: [
              {
                type: "stringOptions",
                value: [datasetId2],
                column: "Dataset",
                operator: "any of",
              },
            ],
            jobType: "EVAL",
            delay: 0,
            sampling: new Decimal("1"),
            targetObject: "dataset",
            scoreName: "score-beta",
            variableMapping: JSON.parse("[]"),
          },
        ],
      });

      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: {
          projectId,
          traceId,
        },
        jobTimestamp,
      });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      // Should create no jobs since dataset-delta doesn't match any filter
      expect(jobs.length).toBe(0);
    }, 10_000);
  });

  describe("execute evals", () => {
    test("evals a valid 'trace' event", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      openAIServer.respondWithDefault();
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
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
          project_id: projectId,
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
          projectId,
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
          project_id: projectId,
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
          project_id: projectId,
          secret_key: encrypt(String(OPENAI_API_KEY)),
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          custom_models: [],
          display_secret_key: "123456",
        })
        .execute();

      const payload = {
        projectId,
        jobExecutionId: jobExecutionId,
        delay: 1000,
      };

      await evaluate({ event: payload });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].project_id).toBe(projectId);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
      expect(jobs[0].status.toString()).toBe("COMPLETED");
      expect(jobs[0].start_time).not.toBeNull();
      expect(jobs[0].end_time).not.toBeNull();
    }, 50_000);

    test("fails to eval without llm api key", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      const templateId = randomUUID();
      await kyselyPrisma.$kysely
        .insertInto("eval_templates")
        .values({
          id: templateId,
          project_id: projectId,
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
          projectId,
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
          project_id: projectId,
          job_configuration_id: jobConfiguration.id,
          status: sql`'PENDING'::"JobExecutionStatus"`,
          start_time: new Date(),
          job_input_trace_id: traceId,
        })
        .execute();

      const payload = {
        projectId,
        jobExecutionId: jobExecutionId,
        delay: 1000,
      };

      await expect(evaluate({ event: payload })).rejects.toThrowError(
        new UnrecoverableError(
          `Invalid model configuration for job ${jobExecutionId}: API key for provider "openai" not found in project ${projectId}`,
        ),
      );

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].project_id).toBe(projectId);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
      // the job will be failed when the exception is caught in the worker consumer
      expect(jobs[0].status.toString()).toBe("PENDING");
    }, 10_000);

    test("fails to eval on openai error", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      openAIServer.respondWithError(401, "Not authorized");

      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
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
          project_id: projectId,
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
          projectId,
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
          project_id: projectId,
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
          project_id: projectId,
          secret_key: encrypt(String(OPENAI_API_KEY)),
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          custom_models: [],
          display_secret_key: "123456",
        })
        .execute();

      const payload = {
        projectId,
        jobExecutionId: jobExecutionId,
        delay: 1000,
      };

      await expect(evaluate({ event: payload })).rejects.toThrowError(
        new LLMCompletionError({
          message:
            "401 status code (no body)\n" +
            "\n" +
            "Troubleshooting URL: https://js.langchain.com/docs/troubleshooting/errors/MODEL_AUTHENTICATION/\n",
          responseStatusCode: 401,
        }),
      );

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].project_id).toBe(projectId);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
      // the job will be failed when the exception is caught in the worker consumer
      expect(jobs[0].status.toString()).toBe("PENDING");
    }, 10_000);

    test("evals should cancel if job is cancelled", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      const templateId = randomUUID();
      await kyselyPrisma.$kysely
        .insertInto("eval_templates")
        .values({
          id: templateId,
          project_id: projectId,
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
          projectId,
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
          project_id: projectId,
          job_configuration_id: jobConfiguration.id,
          status: sql`'CANCELLED'::"JobExecutionStatus"`,
          start_time: new Date(),
          job_input_trace_id: traceId,
        })
        .execute();

      const payload = {
        projectId,
        jobExecutionId: jobExecutionId,
        delay: 1000,
      };

      await evaluate({ event: payload });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);

    test("evals a valid 'trace' event and inserts score to ingestion pipeline", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      openAIServer.respondWithDefault();
      const traceId = randomUUID();

      const templateId = randomUUID();
      await kyselyPrisma.$kysely
        .insertInto("eval_templates")
        .values({
          id: templateId,
          project_id: projectId,
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
          projectId,
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
          project_id: projectId,
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
          project_id: projectId,
          secret_key: encrypt(String(OPENAI_API_KEY)),
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          custom_models: [],
          display_secret_key: "123456",
        })
        .execute();

      const payload = {
        projectId,
        jobExecutionId: jobExecutionId,
        delay: 1000,
      };

      await evaluate({ event: payload });

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].project_id).toBe(projectId);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
      expect(jobs[0].status.toString()).toBe("COMPLETED");
      expect(jobs[0].start_time).not.toBeNull();
      expect(jobs[0].end_time).not.toBeNull();
    }, 20_000);

    test("handles LLM timeout gracefully", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      // Set up the mock to simulate timeout for this test only
      const mockFetchLLMCompletion = vi.mocked(fetchLLMCompletion);
      mockFetchLLMCompletion.mockRejectedValueOnce(
        new ApiError("Request timeout after 120000ms", 500),
      );

      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
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
          project_id: projectId,
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
          projectId,
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
          project_id: projectId,
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
          project_id: projectId,
          secret_key: encrypt(String(OPENAI_API_KEY)),
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          custom_models: [],
          display_secret_key: "123456",
        })
        .execute();

      const payload = {
        projectId,
        jobExecutionId: jobExecutionId,
        delay: 1000,
      };

      // Test that timeout error is thrown
      await expect(evaluate({ event: payload })).rejects.toThrowError(
        /timeout/i,
      );

      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].project_id).toBe(projectId);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
      // Job should still be PENDING because the error will be handled by the queue processor
      expect(jobs[0].status.toString()).toBe("PENDING");

      // Clean up the mock after this test
      mockFetchLLMCompletion.mockReset();
    }, 15_000);
  });

  describe("test variable extraction", () => {
    test("extracts variables from a dataset item", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const datasetId = randomUUID();
      const datasetItemId = randomUUID();
      const traceId = randomUUID();

      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values({
          id: datasetId,
          project_id: projectId,
          name: "test-dataset",
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          input: { input: "This is a great prompt" },
          expected_output: { expected_output: "This is a great response" },
          project_id: projectId,
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
        projectId,
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
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
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
        projectId,
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
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
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
        project_id: projectId,
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
        projectId,
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
      const { projectId } = await createOrgProjectAndApiKey();
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
          projectId,
          variables: ["input", "output"],
          traceId: traceId,
          variableMapping: variableMapping,
        }),
      ).rejects.toThrowError(
        new UnrecoverableError(
          `Observation great-llm-name for trace ${traceId} not found. Please ensure the mapped data exists and consider extending the job delay.`,
        ),
      );
    }, 10_000);

    test("does not fail if observation data is null", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
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
        project_id: projectId,
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
        projectId,
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
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
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
        project_id: projectId,
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
        project_id: projectId,
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
        projectId,
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

    test.each(
      Object.values(ObservationType).filter(
        (type) => !["SPAN", "EVENT", "GENERATION"].includes(type),
      ),
    )(
      "extracts variables from a %s observation",
      async (observationType) => {
        const { projectId } = await createOrgProjectAndApiKey();
        const traceId = randomUUID();

        await upsertTrace({
          id: traceId,
          project_id: projectId,
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
          project_id: projectId,
          name: `great-${observationType.toLowerCase()}-name`,
          type: observationType,
          environment: "production",
          input: JSON.stringify({ huhu: "This is a great prompt" }),
          output: JSON.stringify({ haha: "This is a great response" }),
          start_time: convertDateToClickhouseDateTime(new Date()),
          created_at: convertDateToClickhouseDateTime(new Date()),
          updated_at: convertDateToClickhouseDateTime(new Date()),
        });

        const variableMapping = variableMappingList.parse([
          {
            langfuseObject: observationType.toLowerCase(),
            selectedColumnId: "input",
            templateVariable: "input",
            objectName: `great-${observationType.toLowerCase()}-name`,
          },
          {
            langfuseObject: observationType.toLowerCase(),
            selectedColumnId: "output",
            templateVariable: "output",
            objectName: `great-${observationType.toLowerCase()}-name`,
          },
        ]);

        const result = await extractVariablesFromTracingData({
          projectId,
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
      },
      10_000,
    );
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

  describe("eval execution tracing", () => {
    test("creates trace for eval execution and stores trace ID in score", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();
      const jobExecutionId = randomUUID();
      const templateId = randomUUID();

      await upsertTrace({
        id: traceId,
        project_id: projectId,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      await kyselyPrisma.$kysely
        .insertInto("llm_api_keys")
        .values({
          id: randomUUID(),
          project_id: projectId,
          secret_key: encrypt(String(OPENAI_API_KEY)),
          provider: "openai",
          adapter: LLMAdapter.OpenAI,
          custom_models: [],
          display_secret_key: "123456",
        })
        .execute();

      await prisma.evalTemplate.create({
        data: {
          id: templateId,
          name: "test-evaluator",
          projectId,
          model: "gpt-3.5-turbo",
          provider: "openai",
          prompt: "Please evaluate: {{input}}",
          version: 1,
          vars: ["input"],
          outputSchema: {
            score: "score",
            reasoning: "reasoning",
          },
        },
      });

      const configId = randomUUID();
      await prisma.jobConfiguration.create({
        data: {
          id: configId,
          projectId,
          filter: JSON.parse("[]"),
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "trace",
          scoreName: "test-score",
          variableMapping: JSON.parse(
            '[{"langfuseObject":"trace","selectedColumnId":"input","templateVariable":"input"}]',
          ),
          status: "ACTIVE",
          evalTemplateId: templateId,
        },
      });

      await prisma.jobExecution.create({
        data: {
          id: jobExecutionId,
          projectId,
          jobConfigurationId: configId,
          jobInputTraceId: traceId,
          jobTemplateId: templateId,
          status: "PENDING",
          startTime: new Date(),
        },
      });

      // Mock fetchLLMCompletion to capture the traceSinkParams
      let capturedTraceSinkParams: any = null;

      vi.mocked(fetchLLMCompletion).mockImplementationOnce(
        async (params: any) => {
          capturedTraceSinkParams = params.traceSinkParams;
          return { score: 0.8, reasoning: "Good response" };
        },
      );

      await evaluate({
        event: {
          projectId,
          jobExecutionId,
        },
      });

      // Verify traceSinkParams were passed to fetchLLMCompletion
      expect(capturedTraceSinkParams).toBeDefined();
      expect(capturedTraceSinkParams.targetProjectId).toBe(projectId);
      expect(capturedTraceSinkParams.traceId).toMatch(/^[a-f0-9]{32}$/);
      expect(capturedTraceSinkParams.traceName).toBe(
        "Execute evaluator: test-evaluator",
      );
      expect(capturedTraceSinkParams.environment).toBe(
        LangfuseInternalTraceEnvironment.LLMJudge,
      );
      expect(capturedTraceSinkParams.metadata).toMatchObject({
        job_execution_id: jobExecutionId,
        job_configuration_id: configId,
        target_trace_id: traceId,
        score_id: capturedTraceSinkParams.metadata.score_id,
      });
      expect(capturedTraceSinkParams.metadata.score_id).toBeDefined();
    }, 15_000);
  });

  describe("internal trace environment filtering", () => {
    test("does not create eval jobs for trace-upsert with LLMJudge environment", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      // Create trace with LLMJudge environment
      await upsertTrace({
        id: traceId,
        project_id: projectId,
        environment: LangfuseInternalTraceEnvironment.LLMJudge,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      // Create an active eval configuration
      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId,
        traceEnvironment: LangfuseInternalTraceEnvironment.LLMJudge,
      };

      // Attempt to create eval jobs
      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });

      // Verify no eval jobs were created
      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);

    test("does not create eval jobs for trace-upsert with PromptExperiments environment", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      // Create trace with PromptExperiments environment
      await upsertTrace({
        id: traceId,
        project_id: projectId,
        environment: LangfuseInternalTraceEnvironment.PromptExperiments,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      // Create an active eval configuration
      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId,
        traceEnvironment: LangfuseInternalTraceEnvironment.PromptExperiments,
      };

      // Attempt to create eval jobs
      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });

      // Verify no eval jobs were created
      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);

    test("creates eval jobs for dataset-run-item-upsert with PromptExperiments environment", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();
      const datasetId = randomUUID();
      const datasetItemId = randomUUID();
      const datasetRunId = randomUUID();

      // Create dataset infrastructure
      await kyselyPrisma.$kysely
        .insertInto("datasets")
        .values({
          id: datasetId,
          project_id: projectId,
          name: "test-dataset",
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_items")
        .values({
          id: datasetItemId,
          project_id: projectId,
          dataset_id: datasetId,
        })
        .execute();

      await kyselyPrisma.$kysely
        .insertInto("dataset_runs")
        .values({
          id: datasetRunId,
          name: randomUUID(),
          dataset_id: datasetId,
          project_id: projectId,
        })
        .execute();

      // Create clickhouse run item
      await createDatasetRunItemsCh([
        createDatasetRunItem({
          project_id: projectId,
          dataset_id: datasetId,
          dataset_run_id: datasetRunId,
          dataset_item_id: datasetItemId,
          trace_id: traceId,
        }),
      ]);

      // Create trace with PromptExperiments environment
      await upsertTrace({
        id: traceId,
        project_id: projectId,
        environment: LangfuseInternalTraceEnvironment.PromptExperiments,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      // Create an active dataset eval configuration
      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId,
        datasetItemId,
        traceEnvironment: LangfuseInternalTraceEnvironment.PromptExperiments,
      };

      // Attempt to create eval jobs via dataset-run-item-upsert
      await createEvalJobs({
        sourceEventType: "dataset-run-item-upsert",
        event: payload,
        jobTimestamp,
      });

      // Verify eval jobs WERE created (experiments need this)
      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
      expect(jobs[0].job_input_dataset_item_id).toBe(datasetItemId);
    }, 10_000);

    test("creates eval jobs for trace-upsert with production environment", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      // Create trace with production environment
      await upsertTrace({
        id: traceId,
        project_id: projectId,
        environment: "production",
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      // Create an active eval configuration
      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId,
        traceEnvironment: "production",
      };

      // Attempt to create eval jobs
      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });

      // Verify eval jobs WERE created (normal traces should be evaluated)
      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
    }, 10_000);

    test("creates eval jobs for trace-upsert with undefined environment", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      // Create trace with undefined environment
      await upsertTrace({
        id: traceId,
        project_id: projectId,
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      // Create an active eval configuration
      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId,
        // traceEnvironment intentionally omitted
      };

      // Attempt to create eval jobs
      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });

      // Verify eval jobs WERE created (traces without environment should be evaluated)
      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(1);
      expect(jobs[0].job_input_trace_id).toBe(traceId);
    }, 10_000);

    test("does not create eval jobs for trace-upsert with 'langfuse' environment without hyphen", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const traceId = randomUUID();

      // Create trace with "langfuse" environment (no hyphen)
      await upsertTrace({
        id: traceId,
        project_id: projectId,
        environment: "langfuse",
        timestamp: convertDateToClickhouseDateTime(new Date()),
        created_at: convertDateToClickhouseDateTime(new Date()),
        updated_at: convertDateToClickhouseDateTime(new Date()),
      });

      // Create an active eval configuration
      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
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
        projectId,
        traceId,
        traceEnvironment: "langfuse",
      };

      // Attempt to create eval jobs
      await createEvalJobs({
        sourceEventType: "trace-upsert",
        event: payload,
        jobTimestamp,
      });

      // Verify eval jobs WERE created (only "langfuse-" prefix is blocked)
      const jobs = await kyselyPrisma.$kysely
        .selectFrom("job_executions")
        .selectAll()
        .where("project_id", "=", projectId)
        .execute();

      expect(jobs.length).toBe(0);
    }, 10_000);
  });
});
