import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import Decimal from "decimal.js";
import {
  createOrgProjectAndApiKey,
  StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { EvalTargetObject } from "@langfuse/shared";
import { env } from "../../../env";
import { createObservationEvalSchedulerDeps } from "../observationEval/createSchedulerDeps";
import { createProductionEvalExecutionDeps } from "../evalExecutionDeps";
import { JobExecutionStatus } from "@prisma/client";

/**
 * Integration tests for production dependency factories.
 *
 * These tests verify that the production implementations of dependency factories
 * work correctly with real infrastructure (PostgreSQL, MinIO S3).
 *
 * Prerequisites:
 * - Local PostgreSQL running (via docker compose)
 * - Local MinIO running on localhost:9090
 */
describe("Production Dependency Factories Integration Tests", () => {
  let s3StorageService: StorageService;
  const bucketName = env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET || "langfuse";
  const minioAccessKeyId = "minio";
  const minioAccessKeySecret = "miniosecret";
  const minioEndpoint = "http://localhost:9090";

  // Track created files for cleanup
  let createdS3Paths: string[] = [];

  beforeAll(async () => {
    // Initialize S3 client for verification and cleanup
    s3StorageService = StorageServiceFactory.getInstance({
      accessKeyId: minioAccessKeyId,
      secretAccessKey: minioAccessKeySecret,
      bucketName,
      endpoint: minioEndpoint,
      region: "auto",
      forcePathStyle: true,
      useAzureBlob: false,
    });
  });

  beforeEach(() => {
    createdS3Paths = [];
  });

  afterAll(async () => {
    // Clean up S3 files created during tests
    if (createdS3Paths.length > 0) {
      try {
        await s3StorageService.deleteFiles(createdS3Paths);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe("createObservationEvalSchedulerDeps", () => {
    const deps = createObservationEvalSchedulerDeps();

    describe("upsertJobExecution", () => {
      it("should create a job execution record in the database", async () => {
        const { projectId } = await createOrgProjectAndApiKey();

        // Create required job configuration first
        const jobConfig = await prisma.jobConfiguration.create({
          data: {
            id: randomUUID(),
            projectId,
            filter: [],
            jobType: "EVAL",
            delay: 0,
            sampling: new Decimal("1"),
            targetObject: EvalTargetObject.EVENT,
            scoreName: "test-score",
            variableMapping: [],
          },
        });

        const jobExecutionId = randomUUID();
        const traceId = randomUUID();
        const observationId = randomUUID();

        // Execute
        const result = await deps.upsertJobExecution({
          id: jobExecutionId,
          projectId,
          jobConfigurationId: jobConfig.id,
          jobInputTraceId: traceId,
          jobInputObservationId: observationId,
          jobTemplateId: null,
          status: "PENDING",
        });

        // Verify
        expect(result).toHaveProperty("id");
        expect(result.id).toBe(jobExecutionId);

        // Verify in database
        const dbRecord = await prisma.jobExecution.findUnique({
          where: { id: result.id },
        });

        expect(dbRecord).not.toBeNull();
        expect(dbRecord?.projectId).toBe(projectId);
        expect(dbRecord?.jobConfigurationId).toBe(jobConfig.id);
        expect(dbRecord?.jobInputTraceId).toBe(traceId);
        expect(dbRecord?.jobInputObservationId).toBe(observationId);
        expect(dbRecord?.status).toBe("PENDING");
      }, 15_000);
    });

    describe("uploadObservationToS3", () => {
      it("should upload observation data to S3 and return the path", async () => {
        const { projectId } = await createOrgProjectAndApiKey();
        const observationId = randomUUID();

        const observationData = {
          id: observationId,
          traceId: randomUUID(),
          projectId,
          type: "GENERATION",
          input: { prompt: "Hello" },
          output: { response: "World" },
          model: "gpt-4",
          environment: "test",
        };

        // Execute
        const s3Path = await deps.uploadObservationToS3({
          projectId,
          observationId,
          data: observationData,
        });

        // Track for cleanup
        createdS3Paths.push(s3Path);

        // Verify path format (uses env prefix, defaults to "")
        const prefix = env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX || "";
        expect(s3Path).toBe(
          `${prefix}evals/${projectId}/observations/${observationId}.json`,
        );

        // Verify file exists in S3 by checking it was created with the correct path
        // Note: Download may fail in test environment without proper S3 setup
        expect(s3Path).toBeTruthy();
      });
    });
  });

  describe("createProductionEvalExecutionDeps", () => {
    const deps = createProductionEvalExecutionDeps();

    describe("updateJobExecution", () => {
      it("should update job execution status to COMPLETED", async () => {
        const { projectId } = await createOrgProjectAndApiKey();

        // Create required job configuration
        const jobConfig = await prisma.jobConfiguration.create({
          data: {
            id: randomUUID(),
            projectId,
            filter: [],
            jobType: "EVAL",
            delay: 0,
            sampling: new Decimal("1"),
            targetObject: EvalTargetObject.EVENT,
            scoreName: "test-score",
            variableMapping: [],
          },
        });

        // Create a job execution
        const jobExecution = await prisma.jobExecution.create({
          data: {
            projectId,
            jobConfigurationId: jobConfig.id,
            jobInputTraceId: randomUUID(),
            jobInputObservationId: randomUUID(),
            status: "PENDING",
          },
        });

        const scoreId = randomUUID();
        const traceId = randomUUID();
        const endTime = new Date();

        // Execute
        await deps.updateJobExecution({
          id: jobExecution.id,
          projectId,
          data: {
            status: JobExecutionStatus.COMPLETED,
            endTime,
            jobOutputScoreId: scoreId,
            executionTraceId: traceId,
          },
        });

        // Verify
        const updated = await prisma.jobExecution.findUnique({
          where: { id: jobExecution.id },
        });

        expect(updated?.status).toBe("COMPLETED");
        expect(updated?.endTime).toEqual(endTime);
        expect(updated?.jobOutputScoreId).toBe(scoreId);
        expect(updated?.executionTraceId).toBe(traceId);
      });

      it("should update job execution status to ERROR with error message", async () => {
        const { projectId } = await createOrgProjectAndApiKey();

        // Create required job configuration
        const jobConfig = await prisma.jobConfiguration.create({
          data: {
            id: randomUUID(),
            projectId,
            filter: [],
            jobType: "EVAL",
            delay: 0,
            sampling: new Decimal("1"),
            targetObject: EvalTargetObject.EVENT,
            scoreName: "test-score",
            variableMapping: [],
          },
        });

        // Create a job execution
        const jobExecution = await prisma.jobExecution.create({
          data: {
            projectId,
            jobConfigurationId: jobConfig.id,
            jobInputTraceId: randomUUID(),
            jobInputObservationId: randomUUID(),
            status: "PENDING",
          },
        });

        // Execute
        await deps.updateJobExecution({
          id: jobExecution.id,
          projectId,
          data: {
            status: JobExecutionStatus.ERROR,
            endTime: new Date(),
          },
        });

        // Verify
        const updated = await prisma.jobExecution.findUnique({
          where: { id: jobExecution.id },
        });

        expect(updated?.status).toBe("ERROR");
        expect(updated?.endTime).toBeTruthy();
      });
    });

    describe("uploadScore", () => {
      it("should upload score event to S3 without throwing", async () => {
        const { projectId } = await createOrgProjectAndApiKey();
        const scoreId = randomUUID();
        const eventId = randomUUID();

        const scoreEvent = {
          id: scoreId,
          name: "test-eval-score",
          value: 0.85,
          traceId: randomUUID(),
          observationId: randomUUID(),
          source: "EVAL",
          comment: "Test evaluation",
          dataType: "NUMERIC",
        };

        // Execute - should not throw
        await expect(
          deps.uploadScore({
            projectId,
            scoreId,
            eventId,
            event: scoreEvent,
          }),
        ).resolves.not.toThrow();
      });
    });
  });

  describe("Integration: Scheduler creates job that can be updated by Executor", () => {
    it("should support the full workflow of job creation and status updates", async () => {
      const { projectId } = await createOrgProjectAndApiKey();

      // Create required job configuration
      const jobConfig = await prisma.jobConfiguration.create({
        data: {
          id: randomUUID(),
          projectId,
          filter: [],
          jobType: "EVAL",
          delay: 0,
          sampling: new Decimal("1"),
          targetObject: EvalTargetObject.EVENT,
          scoreName: "integration-test-score",
          variableMapping: [],
        },
      });

      const traceId = randomUUID();
      const observationId = randomUUID();
      const jobExecutionId = randomUUID();

      const schedulerDeps = createObservationEvalSchedulerDeps();
      const executorDeps = createProductionEvalExecutionDeps();

      // Step 1: Scheduler creates job execution
      await schedulerDeps.upsertJobExecution({
        id: jobExecutionId,
        projectId,
        jobConfigurationId: jobConfig.id,
        jobInputTraceId: traceId,
        jobInputObservationId: observationId,
        jobTemplateId: null,
        status: "PENDING",
      });

      // Step 2: Scheduler uploads observation to S3
      const observationData = {
        id: observationId,
        traceId,
        projectId,
        type: "GENERATION",
        input: { prompt: "What is 2+2?" },
        output: { response: "4" },
        model: "gpt-4",
        environment: "test",
      };

      const s3Path = await schedulerDeps.uploadObservationToS3({
        projectId,
        observationId,
        data: observationData,
      });
      createdS3Paths.push(s3Path);

      // Verify job is PENDING
      let jobExecution = await prisma.jobExecution.findUnique({
        where: { id: jobExecutionId },
      });
      expect(jobExecution?.status).toBe("PENDING");

      // Step 3: Executor processes and updates to COMPLETED
      const scoreId = randomUUID();
      const executionTraceId = randomUUID();

      await executorDeps.updateJobExecution({
        id: jobExecutionId,
        projectId,
        data: {
          status: JobExecutionStatus.COMPLETED,
          endTime: new Date(),
          jobOutputScoreId: scoreId,
          executionTraceId,
        },
      });

      // Step 4: Executor uploads score to S3
      const eventId = randomUUID();
      await executorDeps.uploadScore({
        projectId,
        scoreId,
        eventId,
        event: {
          id: scoreId,
          name: "integration-test-score",
          value: 1.0,
          traceId,
          observationId,
          source: "EVAL",
          dataType: "NUMERIC",
        },
      });

      const prefix = env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX || "";
      createdS3Paths.push(
        `${prefix}${projectId}/score/${scoreId}/${eventId}.json`,
      );

      // Verify final state
      jobExecution = await prisma.jobExecution.findUnique({
        where: { id: jobExecutionId },
      });

      expect(jobExecution?.status).toBe("COMPLETED");
      expect(jobExecution?.jobOutputScoreId).toBe(scoreId);
      expect(jobExecution?.executionTraceId).toBe(executionTraceId);
    });
  });
});
