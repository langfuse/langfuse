import { ObservationLevel, singleFilter } from "@langfuse/shared";
import {
  JobConfiguration,
  kyselyPrisma,
  prisma,
} from "@langfuse/shared/src/db";
import {
  convertDateToClickhouseDateTime,
  createOrgProjectAndApiKey,
  TraceRecordReadType,
  upsertObservation,
  upsertTrace,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import Decimal from "decimal.js";
import { afterAll, test as baseTest, beforeAll, describe } from "vitest";
import { z } from "zod/v4";
import { createEvalJobs } from "../features/evaluation/evalService";
import { OpenAIServer } from "./network";
import { pruneDatabase } from "./utils";

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
beforeAll(async () => {
  await pruneDatabase();
  openAIServer.respondWithDefault();
});
afterAll(openAIServer.teardown);

type EvalJobEventPartial = Omit<
  Parameters<typeof createEvalJobs>[0]["event"],
  "projectId" | "traceId"
>;

type TraceRecordOmitProjectId = Partial<Omit<TraceRecordReadType, "projectId">>;
type TraceRecordOmitProjectIdAndId = Partial<
  Omit<TraceRecordReadType, "projectId" | "id">
>;

const __getJobs = (projectId: string) =>
  kyselyPrisma.$kysely
    .selectFrom("job_executions")
    .selectAll()
    .where("project_id", "=", projectId)
    .execute();

type JobExecutions = Awaited<ReturnType<typeof __getJobs>>;

const test = baseTest.extend<{
  traceId1: string;
  traceId2: string;
  projectId: string;
  upsertTrace: (trace: TraceRecordOmitProjectId) => Promise<void>;
  upsertTwoTraces: (
    traces?: [TraceRecordOmitProjectIdAndId, TraceRecordOmitProjectIdAndId],
  ) => Promise<void>;
  configureJob: (
    job: Partial<
      Omit<JobConfiguration, "projectId" | "evalTemplateId" | "id" | "filter">
    > & {
      filter: z.infer<typeof singleFilter>[];
    },
  ) => Promise<void>;
  configureDefaultJobWithSingleFilter: (
    filter: z.infer<typeof singleFilter>,
  ) => Promise<void>;
  createTwoEvalJobs: (
    events?: [EvalJobEventPartial, EvalJobEventPartial],
  ) => Promise<void>;
  getJobs: () => Promise<JobExecutions>;
}>({
  projectId: async ({}, use) => {
    const projectId = randomUUID();

    await createOrgProjectAndApiKey({
      projectId,
    });

    await use(projectId);
  },
  traceId1: randomUUID(),
  traceId2: randomUUID(),
  upsertTrace: async ({ projectId }, use) => {
    await use(async (trace) => {
      const now = new Date();
      const clickhouseNow = convertDateToClickhouseDateTime(now);
      await upsertTrace({
        id: trace.id,
        project_id: projectId,
        timestamp: clickhouseNow,
        created_at: clickhouseNow,
        updated_at: clickhouseNow,
        ...trace,
      });
    });
  },
  upsertTwoTraces: async ({ traceId1, traceId2, upsertTrace }, use) => {
    await use(async ([trace1, trace2] = [{}, {}]) => {
      await upsertTrace({ ...trace1, id: traceId1 });
      await upsertTrace({ ...trace2, id: traceId2 });
    });
  },
  configureJob: async ({ projectId }, use) => {
    const evalTemplate = await prisma.evalTemplate.create({
      data: {
        id: randomUUID(),
        projectId,
        name: "test-template",
        version: 1,
        prompt: "Evaluate this trace",
        model: "gpt-3.5-turbo",
        provider: "openai",
        modelParams: { temperature: 0 },
        vars: [],
        outputSchema: {
          type: "object",
          properties: { score: { type: "number" } },
        },
      },
    });
    await use(async (job) => {
      await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
          evalTemplateId: evalTemplate.id,
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: "trace",
          scoreName: "score",
          variableMapping: JSON.parse("[]"),
          ...job,
        },
      });
    });
  },
  configureDefaultJobWithSingleFilter: async ({ configureJob }, use) => {
    await use(async (filter) => {
      await configureJob({ filter: [filter] });
    });
  },
  createTwoEvalJobs: async ({ projectId, traceId1, traceId2 }, use) => {
    await use(async ([event1, event2] = [{}, {}]) => {
      await createEvalJobs({
        event: {
          projectId,
          traceId: traceId1,
          ...event1,
        },
        jobTimestamp: new Date(),
      });
      await createEvalJobs({
        event: {
          projectId,
          traceId: traceId2,
          ...event2,
        },
        jobTimestamp: new Date(),
      });
    });
  },
  getJobs: async ({ projectId }, use) => {
    await use(async () => await __getJobs(projectId));
  },
});

describe.concurrent("test eval filtering", () => {
  test("creates eval job only for matching environment", async ({
    expect,
    upsertTwoTraces,
    configureDefaultJobWithSingleFilter,
    createTwoEvalJobs,
    getJobs,
    traceId1,
  }) => {
    // Create two traces with different environments
    await upsertTwoTraces([
      {
        environment: "production",
      },
      {
        environment: "staging",
      },
    ]);

    // Create job configuration with environment filter
    await configureDefaultJobWithSingleFilter({
      type: "stringOptions",
      value: ["production"],
      column: "Environment",
      operator: "any of",
    });

    // Create eval jobs for both traces
    await createTwoEvalJobs();

    // Check that only the matching environment's trace got a job
    const jobs = await getJobs();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1); // Only the production environment trace should have a job
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching name", async ({
    expect,
    upsertTwoTraces,
    configureDefaultJobWithSingleFilter,
    createTwoEvalJobs,
    getJobs,
    traceId1,
  }) => {
    // Create two traces with different names
    await upsertTwoTraces([
      {
        name: "important-trace",
      },
      {
        name: "unimportant-trace",
      },
    ]);

    // Create job configuration with name filter
    await configureDefaultJobWithSingleFilter({
      type: "string",
      value: "important-trace",
      column: "Name",
      operator: "=",
    });

    // Create eval jobs for both traces
    await createTwoEvalJobs();

    // Check that only the matching name's trace got a job
    const jobs = await getJobs();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1); // Only the important-trace should have a job
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching ID", async ({
    expect,
    upsertTwoTraces,
    configureDefaultJobWithSingleFilter,
    createTwoEvalJobs,
    getJobs,
    traceId1,
  }) => {
    // Create two traces
    await upsertTwoTraces();

    // Create job configuration with ID filter
    await configureDefaultJobWithSingleFilter({
      type: "string",
      value: traceId1,
      column: "ID",
      operator: "=",
    });

    // Create eval jobs for both traces
    await createTwoEvalJobs();

    // Check that only the matching ID's trace got a job
    const jobs = await getJobs();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching timestamp range", async ({
    expect,
    upsertTwoTraces,
    configureJob,
    createTwoEvalJobs,
    getJobs,
    traceId1,
  }) => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 1000 * 60 * 60 * 24); // 24 hours in the future
    const pastDate = new Date(now.getTime() - 1000 * 60 * 60 * 24); // 24 hours in the past

    // Create two traces with different timestamps
    await upsertTwoTraces([
      {
        timestamp: convertDateToClickhouseDateTime(now),
        created_at: convertDateToClickhouseDateTime(now),
        updated_at: convertDateToClickhouseDateTime(now),
      },
      {
        timestamp: convertDateToClickhouseDateTime(futureDate),
        created_at: convertDateToClickhouseDateTime(futureDate),
        updated_at: convertDateToClickhouseDateTime(futureDate),
      },
    ]);

    // Create job configuration with timestamp filter
    await configureJob({
      filter: [
        {
          type: "datetime",
          value: pastDate,
          column: "Timestamp",
          operator: ">=",
        } satisfies z.infer<typeof singleFilter>,
        {
          type: "datetime",
          value: now,
          column: "Timestamp",
          operator: "<=",
        } satisfies z.infer<typeof singleFilter>,
      ],
    });

    // Create eval jobs for both traces
    await createTwoEvalJobs([
      {
        timestamp: now,
      },
      {
        timestamp: futureDate,
      },
    ]);

    // Check that only the trace within the timestamp range got a job
    const jobs = await getJobs();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching user ID", async ({
    expect,
    upsertTwoTraces,
    configureDefaultJobWithSingleFilter,
    createTwoEvalJobs,
    getJobs,
    traceId1,
  }) => {
    // Create two traces with different user IDs
    await upsertTwoTraces([
      {
        user_id: "user1",
      },
      {
        user_id: "user2",
      },
    ]);

    // Create job configuration with user ID filter
    await configureDefaultJobWithSingleFilter({
      type: "string",
      value: "user1",
      column: "User ID",
      operator: "=",
    });

    // Create eval jobs for both traces
    await createTwoEvalJobs();

    // Check that only the matching user ID's trace got a job
    const jobs = await getJobs();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching session ID", async ({
    expect,
    upsertTwoTraces,
    configureDefaultJobWithSingleFilter,
    createTwoEvalJobs,
    getJobs,
    traceId1,
  }) => {
    // Create two traces with different session IDs
    await upsertTwoTraces([
      {
        session_id: "session1",
      },
      {
        session_id: "session2",
      },
    ]);

    // Create job configuration with session ID filter
    await configureDefaultJobWithSingleFilter({
      type: "string",
      value: "session1",
      column: "Session ID",
      operator: "=",
    });

    // Create eval jobs for both traces
    await createTwoEvalJobs();

    // Check that only the matching session ID's trace got a job
    const jobs = await getJobs();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching metadata", async ({
    expect,
    upsertTwoTraces,
    configureDefaultJobWithSingleFilter,
    createTwoEvalJobs,
    getJobs,
    traceId1,
  }) => {
    // Create two traces with different metadata
    await upsertTwoTraces([
      {
        metadata: { key: "value1" },
      },
      {
        metadata: { key: "value2" },
      },
    ]);

    // Create job configuration with metadata filter
    await configureDefaultJobWithSingleFilter({
      type: "stringObject",
      key: "key",
      value: "value1",
      column: "metadata",
      operator: "=",
    });

    // Create eval jobs for both traces
    await createTwoEvalJobs();

    // Check that only the matching metadata's trace got a job
    const jobs = await getJobs();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching version", async ({
    expect,
    upsertTwoTraces,
    configureDefaultJobWithSingleFilter,
    createTwoEvalJobs,
    getJobs,
    traceId1,
  }) => {
    // Create two traces with different versions
    await upsertTwoTraces([
      {
        version: "v1",
      },
      {
        version: "v2",
      },
    ]);

    // Create job configuration with version filter
    await configureDefaultJobWithSingleFilter({
      type: "string",
      value: "v1",
      column: "Version",
      operator: "=",
    });

    // Create eval jobs for both traces
    await createTwoEvalJobs();

    // Check that only the matching version's trace got a job
    const jobs = await getJobs();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching release", async ({
    expect,
    upsertTwoTraces,
    configureDefaultJobWithSingleFilter,
    createTwoEvalJobs,
    getJobs,
    traceId1,
  }) => {
    // Create two traces with different releases
    await upsertTwoTraces([
      {
        release: "release1",
      },
      {
        release: "release2",
      },
    ]);

    // Create job configuration with release filter
    await configureDefaultJobWithSingleFilter({
      type: "string",
      value: "release1",
      column: "Release",
      operator: "=",
    });

    // Create eval jobs for both traces
    await createTwoEvalJobs();

    // Check that only the matching release's trace got a job
    const jobs = await getJobs();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching level", async ({
    expect,
    upsertTwoTraces,
    configureDefaultJobWithSingleFilter,
    createTwoEvalJobs,
    getJobs,
    traceId1,
    traceId2,
    projectId,
  }) => {
    // Create two traces
    await upsertTwoTraces();

    // Create observations with different levels
    await upsertObservation({
      id: randomUUID(),
      project_id: projectId,
      trace_id: traceId1,
      level: ObservationLevel.DEFAULT.toString(),
      start_time: convertDateToClickhouseDateTime(new Date()),
      end_time: convertDateToClickhouseDateTime(new Date()),
      type: "SPAN",
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    await upsertObservation({
      id: randomUUID(),
      project_id: projectId,
      trace_id: traceId2,
      level: ObservationLevel.ERROR.toString(),
      start_time: convertDateToClickhouseDateTime(new Date()),
      end_time: convertDateToClickhouseDateTime(new Date()),
      type: "SPAN",
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    // Create job configuration with level filter
    await configureDefaultJobWithSingleFilter({
      type: "string",
      value: ObservationLevel.DEFAULT.toString(),
      column: "Level",
      operator: "=",
    });

    // Create eval jobs for both traces
    await createTwoEvalJobs();

    // Check that only the matching level's trace got a job
    const jobs = await getJobs();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching tags", async ({
    expect,
    upsertTwoTraces,
    configureDefaultJobWithSingleFilter,
    createTwoEvalJobs,
    getJobs,
    traceId1,
  }) => {
    // Create two traces with different tags
    await upsertTwoTraces([
      {
        tags: ["tag1"],
      },
      {
        tags: ["tag2"],
      },
    ]);

    // Create job configuration with tags filter
    await configureDefaultJobWithSingleFilter({
      type: "arrayOptions",
      value: ["tag1"],
      column: "Tags",
      operator: "any of",
    });

    // Create eval jobs for both traces
    await createTwoEvalJobs();

    // Check that only the matching tags's trace got a job
    const jobs = await getJobs();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for starred traces", async ({
    expect,
    upsertTwoTraces,
    configureDefaultJobWithSingleFilter,
    createTwoEvalJobs,
    getJobs,
    traceId1,
  }) => {
    // Create two traces with different bookmark status
    await upsertTwoTraces([
      {
        bookmarked: true,
      },
      {
        bookmarked: false,
      },
    ]);

    // Create job configuration with starred filter
    await configureDefaultJobWithSingleFilter({
      type: "boolean",
      value: true,
      column: "bookmarked",
      operator: "=",
    });

    // Create eval jobs for both traces
    await createTwoEvalJobs();

    // Check that only the starred trace got a job
    const jobs = await getJobs();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);
});
