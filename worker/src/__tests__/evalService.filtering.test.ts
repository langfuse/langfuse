import { EvalTemplate, ObservationLevel, singleFilter } from "@langfuse/shared";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import {
  convertDateToClickhouseDateTime,
  upsertObservation,
  upsertTrace,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import Decimal from "decimal.js";
import { afterEach } from "node:test";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test as baseTest,
} from "vitest";
import { z } from "zod";
import { createEvalJobs } from "../ee/evaluation/evalService";
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
beforeEach(async () => {
  await pruneDatabase();
  openAIServer.respondWithDefault();
});
afterEach(openAIServer.reset);
afterAll(openAIServer.teardown);

const test = baseTest.extend<{
  traceId1: string;
  traceId2: string;
  evalTemplate: EvalTemplate;
  projectId: string;
}>({
  projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
  traceId1: randomUUID(),
  traceId2: randomUUID(),
  evalTemplate: async ({}, use) => {
    const evalTemplate = await prisma.evalTemplate.create({
      data: {
        id: randomUUID(),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
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

    await use(evalTemplate);
  },
});

describe("test eval filtering", () => {
  test("creates eval job only for matching environment", async ({
    traceId1,
    traceId2,
    evalTemplate,
    projectId,
  }) => {
    // Create two traces with different environments
    await upsertTrace({
      id: traceId1,
      project_id: projectId,
      environment: "production",
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    await upsertTrace({
      id: traceId2,
      project_id: projectId,
      environment: "staging",
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    // Create job configuration with environment filter
    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: projectId,
        filter: [
          {
            type: "stringOptions",
            value: ["production"],
            column: "Environment",
            operator: "any of",
          } satisfies z.infer<typeof singleFilter>,
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: evalTemplate.id,
      },
    });

    // Create eval jobs for both traces
    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId1,
      },
    });

    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId2,
      },
    });

    // Check that only the matching environment's trace got a job
    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1); // Only the production environment trace should have a job
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching name", async ({
    traceId1,
    traceId2,
    evalTemplate,
    projectId,
  }) => {
    // Create two traces with different names
    await upsertTrace({
      id: traceId1,
      project_id: projectId,
      name: "important-trace",
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    await upsertTrace({
      id: traceId2,
      project_id: projectId,
      name: "unimportant-trace",
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    // Create job configuration with name filter
    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: projectId,
        filter: [
          {
            type: "string",
            value: "important-trace",
            column: "Name",
            operator: "=",
          } satisfies z.infer<typeof singleFilter>,
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: evalTemplate.id,
      },
    });

    // Create eval jobs for both traces
    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId1,
      },
    });

    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId2,
      },
    });

    // Check that only the matching name's trace got a job
    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1); // Only the important-trace should have a job
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching ID", async ({
    traceId1,
    traceId2,
    evalTemplate,
    projectId,
  }) => {
    // Create two traces
    await upsertTrace({
      id: traceId1,
      project_id: projectId,
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    await upsertTrace({
      id: traceId2,
      project_id: projectId,
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    // Create job configuration with ID filter
    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: projectId,
        filter: [
          {
            type: "string",
            value: traceId1,
            column: "ID",
            operator: "=",
          } satisfies z.infer<typeof singleFilter>,
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: evalTemplate.id,
      },
    });

    // Create eval jobs for both traces
    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId1,
      },
    });

    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId2,
      },
    });

    // Check that only the matching ID's trace got a job
    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching timestamp range", async ({
    traceId1,
    traceId2,
    evalTemplate,
    projectId,
  }) => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 1000 * 60 * 60 * 24); // 24 hours in the future
    const pastDate = new Date(now.getTime() - 1000 * 60 * 60 * 24); // 24 hours in the past

    // Create two traces with different timestamps
    await upsertTrace({
      id: traceId1,
      project_id: projectId,
      timestamp: convertDateToClickhouseDateTime(now),
      created_at: convertDateToClickhouseDateTime(now),
      updated_at: convertDateToClickhouseDateTime(now),
    });

    await upsertTrace({
      id: traceId2,
      project_id: projectId,
      timestamp: convertDateToClickhouseDateTime(futureDate),
      created_at: convertDateToClickhouseDateTime(futureDate),
      updated_at: convertDateToClickhouseDateTime(futureDate),
    });

    // Create job configuration with timestamp filter
    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: projectId,
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
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: evalTemplate.id,
      },
    });

    // Create eval jobs for both traces
    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId1,
        timestamp: now,
      },
    });

    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId2,
        timestamp: futureDate,
      },
    });

    // Check that only the trace within the timestamp range got a job
    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching user ID", async ({
    traceId1,
    traceId2,
    evalTemplate,
    projectId,
  }) => {
    // Create two traces with different user IDs
    await upsertTrace({
      id: traceId1,
      project_id: projectId,
      user_id: "user1",
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    await upsertTrace({
      id: traceId2,
      project_id: projectId,
      user_id: "user2",
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    // Create job configuration with user ID filter
    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: projectId,
        filter: [
          {
            type: "string",
            value: "user1",
            column: "User ID",
            operator: "=",
          } satisfies z.infer<typeof singleFilter>,
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: evalTemplate.id,
      },
    });

    // Create eval jobs for both traces
    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId1,
      },
    });

    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId2,
      },
    });

    // Check that only the matching user ID's trace got a job
    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching session ID", async ({
    traceId1,
    traceId2,
    evalTemplate,
    projectId,
  }) => {
    // Create two traces with different session IDs
    await upsertTrace({
      id: traceId1,
      project_id: projectId,
      session_id: "session1",
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    await upsertTrace({
      id: traceId2,
      project_id: projectId,
      session_id: "session2",
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    // Create job configuration with session ID filter
    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: projectId,
        filter: [
          {
            type: "string",
            value: "session1",
            column: "Session ID",
            operator: "=",
          } satisfies z.infer<typeof singleFilter>,
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: evalTemplate.id,
      },
    });

    // Create eval jobs for both traces
    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId1,
      },
    });

    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId2,
      },
    });

    // Check that only the matching session ID's trace got a job
    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching metadata", async ({
    traceId1,
    traceId2,
    evalTemplate,
    projectId,
  }) => {
    // Create two traces with different metadata
    await upsertTrace({
      id: traceId1,
      project_id: projectId,
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
      metadata: { key: "value1" },
    });

    await upsertTrace({
      id: traceId2,
      project_id: projectId,
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
      metadata: { key: "value2" },
    });

    // Create job configuration with metadata filter
    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: projectId,
        filter: [
          {
            type: "stringObject",
            key: "key",
            value: "value1",
            column: "metadata",
            operator: "=",
          } satisfies z.infer<typeof singleFilter>,
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: evalTemplate.id,
      },
    });

    // Create eval jobs for both traces
    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId1,
      },
    });

    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId2,
      },
    });

    // Check that only the matching metadata's trace got a job
    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching version", async ({
    traceId1,
    traceId2,
    evalTemplate,
    projectId,
  }) => {
    // Create two traces with different versions
    await upsertTrace({
      id: traceId1,
      project_id: projectId,
      version: "v1",
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    await upsertTrace({
      id: traceId2,
      project_id: projectId,
      version: "v2",
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    // Create job configuration with version filter
    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: projectId,
        filter: [
          {
            type: "string",
            value: "v1",
            column: "Version",
            operator: "=",
          } satisfies z.infer<typeof singleFilter>,
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: evalTemplate.id,
      },
    });

    // Create eval jobs for both traces
    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId1,
      },
    });

    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId2,
      },
    });

    // Check that only the matching version's trace got a job
    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching release", async ({
    traceId1,
    traceId2,
    evalTemplate,
    projectId,
  }) => {
    // Create two traces with different releases
    await upsertTrace({
      id: traceId1,
      project_id: projectId,
      release: "release1",
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    await upsertTrace({
      id: traceId2,
      project_id: projectId,
      release: "release2",
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    // Create job configuration with release filter
    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: projectId,
        filter: [
          {
            type: "string",
            value: "release1",
            column: "Release",
            operator: "=",
          } satisfies z.infer<typeof singleFilter>,
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: evalTemplate.id,
      },
    });

    // Create eval jobs for both traces
    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId1,
      },
    });

    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId2,
      },
    });

    // Check that only the matching release's trace got a job
    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching level", async ({
    traceId1,
    traceId2,
    evalTemplate,
    projectId,
  }) => {
    // Create two traces
    await upsertTrace({
      id: traceId1,
      project_id: projectId,
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    await upsertTrace({
      id: traceId2,
      project_id: projectId,
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

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
    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: projectId,
        filter: [
          {
            type: "string",
            value: ObservationLevel.DEFAULT.toString(),
            column: "Level",
            operator: "=",
          } satisfies z.infer<typeof singleFilter>,
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: evalTemplate.id,
      },
    });

    // Create eval jobs for both traces
    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId1,
      },
    });

    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId2,
      },
    });

    // Check that only the matching level's trace got a job
    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for matching tags", async ({
    traceId1,
    traceId2,
    evalTemplate,
    projectId,
  }) => {
    // Create two traces with different tags
    await upsertTrace({
      id: traceId1,
      project_id: projectId,
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
      tags: ["tag1"],
    });

    await upsertTrace({
      id: traceId2,
      project_id: projectId,
      tags: ["tag2"],
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
    });

    // Create job configuration with tags filter
    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: projectId,
        filter: [
          {
            type: "arrayOptions",
            value: ["tag1"],
            column: "Tags",
            operator: "any of",
          } satisfies z.infer<typeof singleFilter>,
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: evalTemplate.id,
      },
    });

    // Create eval jobs for both traces
    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId1,
      },
    });

    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId2,
      },
    });

    // Check that only the matching tags's trace got a job
    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);

  test("creates eval job only for starred traces", async ({
    traceId1,
    traceId2,
    evalTemplate,
    projectId,
  }) => {
    // Create two traces with different bookmark status
    await upsertTrace({
      id: traceId1,
      project_id: projectId,
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
      bookmarked: true,
    });

    await upsertTrace({
      id: traceId2,
      project_id: projectId,
      timestamp: convertDateToClickhouseDateTime(new Date()),
      created_at: convertDateToClickhouseDateTime(new Date()),
      updated_at: convertDateToClickhouseDateTime(new Date()),
      bookmarked: false,
    });

    // Create job configuration with starred filter
    await prisma.jobConfiguration.create({
      data: {
        id: randomUUID(),
        projectId: projectId,
        filter: [
          {
            type: "boolean",
            value: true,
            column: "bookmarked",
            operator: "=",
          } satisfies z.infer<typeof singleFilter>,
        ],
        jobType: "EVAL",
        delay: 0,
        sampling: new Decimal("1"),
        targetObject: "trace",
        scoreName: "score",
        variableMapping: JSON.parse("[]"),
        evalTemplateId: evalTemplate.id,
      },
    });

    // Create eval jobs for both traces
    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId1,
      },
    });

    await createEvalJobs({
      event: {
        projectId: projectId,
        traceId: traceId2,
      },
    });

    // Check that only the starred trace got a job
    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", projectId)
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].job_input_trace_id).toBe(traceId1);
    expect(jobs[0].status.toString()).toBe("PENDING");
  }, 10_000);
});
