import { expect, test, describe, vi } from "vitest";
import { createEvalJobs, evaluate } from "../eval-service";
import { kyselyPrisma, prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";
import Decimal from "decimal.js";
import { pruneDatabase } from "./utils";

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
      timestamp: "2022-01-01T00:00:00.000Z",
      id: "abc",
      data: {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
      },
    };

    await createEvalJobs({ data: payload });

    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(jobs[0].job_input_trace_id).toBe(traceId);
    expect(jobs[0].status.toString()).toBe("PENDING");
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
      timestamp: "2022-01-01T00:00:00.000Z",
      id: "abc",
      data: {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
      },
    };

    await createEvalJobs({ data: payload });
    await createEvalJobs({ data: payload }); // calling it twice to check it is only generated once

    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(jobs[0].job_input_trace_id).toBe(traceId);
    expect(jobs[0].status.toString()).toBe("PENDING");
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
      },
    });

    const payload = {
      timestamp: "2022-01-01T00:00:00.000Z",
      id: "abc",
      data: {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: traceId,
      },
    };

    await createEvalJobs({ data: payload });

    // update the trace to deselect the trace
    await kyselyPrisma.$kysely
      .updateTable("traces")
      .set("user_id", "b")
      .where("id", "=", traceId)
      .execute();

    await createEvalJobs({
      data: payload,
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
  }, 10_000);
});

describe("execute evals", () => {
  test("evals a valid eval event", async () => {
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

    const template = await prisma.evalTemplate.create({
      data: {
        id: randomUUID(),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        name: "test-template",
        version: 1,
        prompt: "Please evaluate toxicity {{input}} {{output}}",
        model: "gpt-3.5-turbo",
        modelParams: {},
        outputSchema: {
          reasoning: "Please explain your reasoning",
          score: "Please provide a score between 0 and 1",
        },
      },
    });

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
        evalTemplateId: template.id,
      },
    });

    const jobExecution = await prisma.jobExecution.create({
      data: {
        id: randomUUID(),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        jobConfigurationId: jobConfiguration.id,
        status: "PENDING",
        startTime: new Date(),
        jobInputTraceId: traceId,
      },
    });

    const payload = {
      timestamp: "2022-01-01T00:00:00.000Z",
      id: "abc",
      data: {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        jobExecutionId: jobExecution.id,
      },
    };

    await evaluate({ data: payload });

    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
      .execute();

    expect(jobs.length).toBe(1);
    expect(jobs[0].project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(jobs[0].job_input_trace_id).toBe(traceId);
    expect(jobs[0].status.toString()).toBe("COMPLETED");

    const scores = await kyselyPrisma.$kysely
      .selectFrom("scores")
      .selectAll()
      .where("trace_id", "=", traceId)
      .execute();

    expect(scores.length).toBe(1);
    expect(scores[0].trace_id).toBe(traceId);
    expect(scores[0].comment).not.toBeNull();
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

    const template = await prisma.evalTemplate.create({
      data: {
        id: randomUUID(),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        name: "test-template",
        version: 1,
        prompt: "Please evaluate toxicity {{input}} {{output}}",
        model: "gpt-3.5-turbo",
        modelParams: {},
        outputSchema: {
          reasoning: "Please explain your reasoning",
          score: "Please provide a score between 0 and 1",
        },
      },
    });

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
        evalTemplateId: template.id,
      },
    });

    const jobExecution = await prisma.jobExecution.create({
      data: {
        id: randomUUID(),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        jobConfigurationId: jobConfiguration.id,
        status: "CANCELLED",
        startTime: new Date(),
        jobInputTraceId: traceId,
      },
    });

    const payload = {
      timestamp: "2022-01-01T00:00:00.000Z",
      id: "abc",
      data: {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        jobExecutionId: jobExecution.id,
      },
    };

    await evaluate({ data: payload });

    const jobs = await kyselyPrisma.$kysely
      .selectFrom("job_executions")
      .selectAll()
      .where("project_id", "=", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a")
      .execute();

    expect(jobs.length).toBe(0);
  }, 10_000);
});
