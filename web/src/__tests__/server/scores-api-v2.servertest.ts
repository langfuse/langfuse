import {
  createObservation,
  createTraceScore,
  createTrace,
  createSessionScore,
  createDatasetRunScore,
} from "@langfuse/shared/src/server";
import {
  createObservationsCh,
  createScoresCh,
  createTracesCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { GetScoreResponseV2, GetScoresResponseV2 } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";
import { z } from "zod/v4";

describe("/api/public/v2/scores API Endpoint", () => {
  describe("GET /api/public/v2/scores/:scoreId", () => {
    it("should GET a trace score", async () => {
      const { projectId: projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const traceId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: traceId,
        name: "Test Score",
        timestamp: Date.now(),
        observation_id: v4(),
        value: 100.5,
        source: "API",
        comment: "comment",
        data_type: "NUMERIC" as const,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
        is_deleted: 0,
      });

      await createScoresCh([score]);

      const getScore = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(getScore.status).toBe(200);
      expect(getScore.body).toMatchObject({
        id: scoreId,
        name: "Test Score",
        value: 100.5,
        comment: "comment",
        source: "API",
        traceId,
        observationId: score.observation_id,
        dataType: "NUMERIC",
      });
    });

    it("should GET score with minimal score data and minimal trace data", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const minimalTraceId = v4();

      const trace = createTrace({
        id: minimalTraceId,
        project_id: projectId,
      });
      await createTracesCh([trace]);

      const minimalScoreId = v4();

      const score = createTraceScore({
        id: minimalScoreId,
        project_id: projectId,
        trace_id: minimalTraceId,
        name: "score-name",
        value: 100.5,
        source: "API",
        comment: null,
        observation_id: null,
      });
      await createScoresCh([score]);

      const fetchedScore = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${minimalScoreId}`,
        undefined,
        auth,
      );

      expect(fetchedScore.status).toBe(200);
    });

    it("should GET a session score", async () => {
      const { projectId: projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const sessionId = v4();
      const score = createSessionScore({
        id: scoreId,
        project_id: projectId,
        session_id: sessionId,
        name: "Test Score",
        timestamp: Date.now(),
        value: 100.5,
        source: "API",
        comment: "comment",
        data_type: "NUMERIC" as const,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
        is_deleted: 0,
      });

      await createScoresCh([score]);

      const getScore = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(getScore.status).toBe(200);
      expect(getScore.body).toMatchObject({
        id: scoreId,
        name: "Test Score",
        value: 100.5,
        comment: "comment",
        source: "API",
        sessionId,
        observationId: null,
        traceId: null,
        datasetRunId: null,
        dataType: "NUMERIC",
      });
    });

    it("should GET a run score", async () => {
      const { projectId: projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const runId = v4();
      const score = createDatasetRunScore({
        id: scoreId,
        project_id: projectId,
        dataset_run_id: runId,
        name: "Test Score",
        timestamp: Date.now(),
        value: 100.5,
        source: "API",
        comment: "comment",
        data_type: "NUMERIC" as const,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
        is_deleted: 0,
      });

      await createScoresCh([score]);

      const getScore = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(getScore.status).toBe(200);
      expect(getScore.body).toMatchObject({
        id: scoreId,
        name: "Test Score",
        value: 100.5,
        comment: "comment",
        source: "API",
        datasetRunId: runId,
        observationId: null,
        traceId: null,
        dataType: "NUMERIC",
      });
    });
  });

  describe("GET /api/public/scores", () => {
    describe("should Filter scores", () => {
      let configId = "";
      const userId = "user-name";
      const traceTags = ["prod", "test"];
      const traceTags_2 = ["staging", "dev"];
      const scoreName = "score-name";
      const queryUserName = `userId=${userId}&name=${scoreName}`;
      const traceId = v4();
      const traceId_2 = v4();
      const traceId_3 = v4();
      const generationId = v4();
      const sessionId = v4();
      const runId = v4();
      const scoreId_1 = v4();
      const scoreId_2 = v4();
      const scoreId_3 = v4();
      const scoreId_4 = v4();
      const scoreId_5 = v4();
      const scoreId_6 = v4();
      const scoreId_7 = v4();
      const scoreId_8 = v4();
      const scoreId_9 = v4();
      const correctionScoreId_1 = v4();
      const correctionScoreId_2 = v4();
      let authentication: string;
      let newProjectId: string;
      let executionTraceId: string;

      beforeEach(async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        authentication = auth;
        newProjectId = projectId;
        executionTraceId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: newProjectId,
          user_id: userId,
          tags: traceTags,
        });

        const trace_2 = createTrace({
          id: traceId_2,
          project_id: newProjectId,
          user_id: userId,
          tags: traceTags_2,
        });

        const trace_3 = createTrace({
          id: traceId_3,
          project_id: newProjectId,
          user_id: userId,
          tags: ["staging"],
          environment: "production",
        });

        await createTracesCh([trace, trace_2, trace_3]);

        const generation = createObservation({
          id: generationId,
          project_id: newProjectId,
          type: "GENERATION",
        });

        await createObservationsCh([generation]);

        const config = await prisma.scoreConfig.create({
          data: {
            name: scoreName,
            dataType: "NUMERIC",
            maxValue: 100,
            projectId: newProjectId,
          },
        });

        configId = config.id;

        const score1 = createTraceScore({
          id: scoreId_1,
          project_id: newProjectId,
          trace_id: traceId,
          name: scoreName,
          value: 10.5,
          data_type: "NUMERIC",
          observation_id: generationId,
          config_id: config.id,
          comment: "comment",
          execution_trace_id: executionTraceId,
        });

        const score2 = createTraceScore({
          id: scoreId_2,
          project_id: newProjectId,
          trace_id: traceId,
          name: scoreName,
          value: 50.5,
          data_type: "NUMERIC",
          observation_id: generationId,
          comment: "comment",
        });

        const score3 = createTraceScore({
          id: scoreId_3,
          project_id: newProjectId,
          trace_id: traceId,
          name: scoreName,
          value: 100.8,
          data_type: "NUMERIC",
          observation_id: generationId,
          comment: "comment",
        });

        const score4 = createTraceScore({
          id: scoreId_4,
          project_id: newProjectId,
          trace_id: traceId_2,
          name: "other-score-name",
          value: 0,
          string_value: "best",
          data_type: "CATEGORICAL",
          comment: "comment",
        });

        const score5 = createTraceScore({
          id: scoreId_5,
          project_id: newProjectId,
          trace_id: traceId_3,
          name: "other-score-name",
          value: 0,
          data_type: "CATEGORICAL",
          string_value: "test",
          comment: "comment",
          environment: "production",
        });

        const correction1 = createTraceScore({
          id: correctionScoreId_1,
          project_id: newProjectId,
          trace_id: traceId_2,
          name: "output",
          data_type: "CORRECTION",
          long_string_value: "correction-value-1",
          environment: "annotation",
        });

        const correction2 = createTraceScore({
          id: correctionScoreId_2,
          project_id: newProjectId,
          trace_id: traceId_3,
          name: "output",
          data_type: "CORRECTION",
          long_string_value: "correction-value-2",
          environment: "annotation",
        });

        const sessionScore1 = createSessionScore({
          id: scoreId_6,
          project_id: newProjectId,
          session_id: sessionId,
          name: scoreName,
          value: 100.5,
          data_type: "NUMERIC",
        });

        const sessionScore2 = createSessionScore({
          id: scoreId_7,
          project_id: newProjectId,
          session_id: sessionId,
          name: "session-score-name",
          value: 100.5,
          data_type: "NUMERIC",
        });

        const runScore1 = createDatasetRunScore({
          id: scoreId_8,
          project_id: newProjectId,
          dataset_run_id: runId,
          name: scoreName,
          value: 100.5,
          data_type: "NUMERIC",
        });

        const runScore2 = createDatasetRunScore({
          id: scoreId_9,
          project_id: newProjectId,
          dataset_run_id: runId,
          name: scoreName,
          value: 100.5,
          data_type: "NUMERIC",
        });

        await createScoresCh([
          score1,
          score2,
          score3,
          score4,
          score5,
          sessionScore1,
          sessionScore2,
          runScore1,
          runScore2,
          correction1,
          correction2,
        ]);
      });

      it("get all scores", async () => {
        const getAllScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores`,
          undefined,
          authentication,
        );
        expect(getAllScore.status).toBe(200);
        expect(getAllScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 11,
          totalPages: 1,
        });
        for (const val of getAllScore.body.data) {
          if (val.traceId) {
            expect(val).toMatchObject({
              sessionId: null,
            });
          } else {
            expect(val).toEqual(
              expect.objectContaining({
                trace: null,
                ...(val.sessionId === sessionId ? { sessionId } : {}),
                ...(val.datasetRunId
                  ? { datasetRunId: expect.any(String) }
                  : {}),
              }),
            );
            // Check that one of the two conditions is true
            expect(
              val.sessionId === sessionId || val.datasetRunId,
            ).toBeTruthy();
          }
        }

        const scoreWithExecutionTraceId = getAllScore.body.data.find(
          (score) => score.id === scoreId_1,
        );
        expect(scoreWithExecutionTraceId?.executionTraceId).toBe(
          executionTraceId,
        );
      });

      it("get all scores for config", async () => {
        const getAllScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?configId=${configId}`,
          undefined,
          authentication,
        );

        expect(getAllScore.status).toBe(200);
        expect(getAllScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 1,
          totalPages: 1,
        });
        for (const val of getAllScore.body.data) {
          expect(val).toMatchObject({
            traceId: traceId,
            observationId: generationId,
            configId: configId,
          });
        }
      });

      it("get all scores for numeric data type", async () => {
        const getAllScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?dataType=NUMERIC`,
          undefined,
          authentication,
        );

        expect(getAllScore.status).toBe(200);
        expect(getAllScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 7,
          totalPages: 1,
        });
        for (const val of getAllScore.body.data) {
          expect(val).toMatchObject({
            dataType: "NUMERIC",
          });
        }
      });

      it("get all scores for correction data type", async () => {
        const getAllScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?dataType=CORRECTION`,
          undefined,
          authentication,
        );

        expect(getAllScore.status).toBe(200);
        expect(getAllScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 2,
          totalPages: 1,
        });
        for (const val of getAllScore.body.data) {
          expect(val).toMatchObject({
            dataType: "CORRECTION",
            name: "output",
          });
          expect(val.stringValue).toContain("correction-value");
        }
      });

      it("get all scores for trace tag 'prod'", async () => {
        const getAllScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?traceTags=prod`,
          undefined,
          authentication,
        );

        expect(getAllScore.status).toBe(200);
        expect(getAllScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 3,
          totalPages: 1,
        });
        for (const val of getAllScore.body.data) {
          expect(val.traceId).toBe(traceId);
          expect(val.trace?.tags?.sort()).toEqual(["prod", "test"].sort());
          expect(val.trace?.userId).toBe("user-name");
        }
      });

      it("get all scores for environment 'production'", async () => {
        const getAllScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?environment=production`,
          undefined,
          authentication,
        );

        expect(getAllScore.status).toBe(200);
        expect(getAllScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 1,
          totalPages: 1,
        });
        for (const val of getAllScore.body.data) {
          expect(val).toMatchObject({
            traceId: traceId_3,
            trace: {
              userId: "user-name",
              tags: ["staging"],
              environment: "production",
            },
            environment: "production",
          });
        }
      });

      describe("should filter scores by environment correctly for session scores", () => {
        let sessionScoreWithEnvId: string;
        let sessionScoreDefaultEnvId: string;
        let traceScoreWithEnvId: string;

        beforeEach(async () => {
          sessionScoreWithEnvId = v4();
          sessionScoreDefaultEnvId = v4();
          traceScoreWithEnvId = v4();

          // Session score with 'staging' environment
          const sessionScoreWithEnv = createSessionScore({
            id: sessionScoreWithEnvId,
            project_id: newProjectId,
            session_id: v4(),
            name: "session-score-with-env",
            value: 80,
            data_type: "NUMERIC",
            environment: "staging",
          });

          // Session score with default environment
          const sessionScoreDefaultEnv = createSessionScore({
            id: sessionScoreDefaultEnvId,
            project_id: newProjectId,
            session_id: v4(),
            name: "session-score-default-env",
            value: 90,
            data_type: "NUMERIC",
            environment: "default",
          });

          // Trace score with 'staging' environment on a trace with 'development' environment
          const traceWithDifferentEnv = createTrace({
            id: v4(),
            project_id: newProjectId,
            user_id: "env-test-user",
            environment: "development",
          });

          await createTracesCh([traceWithDifferentEnv]);

          const traceScoreWithEnv = createTraceScore({
            id: traceScoreWithEnvId,
            project_id: newProjectId,
            trace_id: traceWithDifferentEnv.id,
            name: "trace-score-with-env",
            value: 70,
            data_type: "NUMERIC",
            environment: "staging",
          });

          await createScoresCh([
            sessionScoreWithEnv,
            sessionScoreDefaultEnv,
            traceScoreWithEnv,
          ]);
        });

        it("should return session scores when filtering by environment", async () => {
          const getAllScore = await makeZodVerifiedAPICall(
            GetScoresResponseV2,
            "GET",
            `/api/public/v2/scores?environment=staging`,
            undefined,
            authentication,
          );

          expect(getAllScore.status).toBe(200);
          // Should include: session score with staging env + trace score with staging env
          // The trace score has staging environment on the score itself, so it should be included
          const scoreIds = getAllScore.body.data.map((s) => s.id);
          expect(scoreIds).toContain(sessionScoreWithEnvId);
          expect(scoreIds).toContain(traceScoreWithEnvId);
          expect(scoreIds).not.toContain(sessionScoreDefaultEnvId);
        });

        it("should return session scores with default environment", async () => {
          const getAllScore = await makeZodVerifiedAPICall(
            GetScoresResponseV2,
            "GET",
            `/api/public/v2/scores?environment=default`,
            undefined,
            authentication,
          );

          expect(getAllScore.status).toBe(200);
          const scoreIds = getAllScore.body.data.map((s) => s.id);
          expect(scoreIds).toContain(sessionScoreDefaultEnvId);
          expect(scoreIds).not.toContain(sessionScoreWithEnvId);
        });

        it("should apply environment filter to traces when combined with trace filters", async () => {
          // When filtering by environment + userId, the environment should also filter traces
          // This trace score has score.environment=staging but trace.environment=development
          // When filtering by userId (a trace filter), the trace environment should also be checked
          const getAllScore = await makeZodVerifiedAPICall(
            GetScoresResponseV2,
            "GET",
            `/api/public/v2/scores?environment=staging&userId=env-test-user`,
            undefined,
            authentication,
          );

          expect(getAllScore.status).toBe(200);
          // The trace score should NOT be returned because:
          // - It matches score.environment=staging
          // - It matches trace.user_id=env-test-user
          // - But trace.environment=development (not staging)
          // When trace filters are present, we also filter by trace environment
          const scoreIds = getAllScore.body.data.map((s) => s.id);
          expect(scoreIds).not.toContain(traceScoreWithEnvId);
        });

        it("should return trace scores when environment matches both score and trace", async () => {
          // Create a trace with matching environment
          const matchingTraceId = v4();
          const matchingScoreId = v4();

          const matchingTrace = createTrace({
            id: matchingTraceId,
            project_id: newProjectId,
            user_id: "matching-env-user",
            environment: "staging",
          });

          await createTracesCh([matchingTrace]);

          const matchingScore = createTraceScore({
            id: matchingScoreId,
            project_id: newProjectId,
            trace_id: matchingTraceId,
            name: "matching-score",
            value: 100,
            data_type: "NUMERIC",
            environment: "staging",
          });

          await createScoresCh([matchingScore]);

          const getAllScore = await makeZodVerifiedAPICall(
            GetScoresResponseV2,
            "GET",
            `/api/public/v2/scores?environment=staging&userId=matching-env-user`,
            undefined,
            authentication,
          );

          expect(getAllScore.status).toBe(200);
          const scoreIds = getAllScore.body.data.map((s) => s.id);
          // This score should be returned because both score.environment and trace.environment match
          expect(scoreIds).toContain(matchingScoreId);
        });
      });

      it("get all scores for trace tags 'staging' and 'dev'", async () => {
        const getAllScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?traceTags=${["staging", "dev"]}`,
          undefined,
          authentication,
        );

        expect(getAllScore.status).toBe(200);
        expect(getAllScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 2,
          totalPages: 1,
        });
        for (const val of getAllScore.body.data) {
          expect(val).toMatchObject({
            traceId: traceId_2,
            trace: {
              tags: expect.arrayContaining(["dev", "staging"]),
              userId: "user-name",
            },
          });
        }
      });

      describe("should Filter scores by queueId", () => {
        describe("queueId filtering", () => {
          let queueId: string;

          beforeEach(async () => {
            queueId = v4();
            const score = createTraceScore({
              id: v4(),
              project_id: newProjectId,
              trace_id: traceId,
              name: "score-name",
              value: 100.5,
              source: "ANNOTATION",
              comment: "comment",
              observation_id: generationId,
              queue_id: queueId,
            });
            const score2 = createTraceScore({
              id: v4(),
              project_id: newProjectId,
              trace_id: traceId,
              name: "score-name",
              value: 75.0,
              source: "ANNOTATION",
              comment: "comment",
              observation_id: generationId,
              queue_id: queueId,
            });

            await createScoresCh([score, score2]);
          });

          it("get all scores for queueId", async () => {
            const getAllScore = await makeZodVerifiedAPICall(
              GetScoresResponseV2,
              "GET",
              `/api/public/v2/scores?queueId=${queueId}`,
              undefined,
              authentication,
            );
            expect(getAllScore.status).toBe(200);
            expect(getAllScore.body.meta).toMatchObject({
              page: 1,
              limit: 50,
              totalItems: 2,
              totalPages: 1,
            });
            for (const val of getAllScore.body.data) {
              expect(val).toMatchObject({
                traceId: traceId,
                observationId: generationId,
                queueId: queueId,
                source: "ANNOTATION",
              });
            }
          });
        });
      });

      describe("should use score operators correctly", () => {
        it("test only operator", async () => {
          const getScore = await makeZodVerifiedAPICall(
            GetScoresResponseV2,
            "GET",
            `/api/public/v2/scores?${queryUserName}&operator=<`,
            undefined,
            authentication,
          );
          expect(getScore.status).toBe(200);
          expect(getScore.body.meta).toMatchObject({
            page: 1,
            limit: 50,
            totalItems: 3,
            totalPages: 1,
          });
        });

        it("test only value", async () => {
          const getScore = await makeZodVerifiedAPICall(
            GetScoresResponseV2,
            "GET",
            `/api/public/v2/scores?${queryUserName}&value=0.8`,
            undefined,
            authentication,
          );
          expect(getScore.status).toBe(200);
          expect(getScore.body.meta).toMatchObject({
            page: 1,
            limit: 50,
            totalItems: 3,
            totalPages: 1,
          });
        });

        it("test operator <", async () => {
          const getScore = await makeZodVerifiedAPICall(
            GetScoresResponseV2,
            "GET",
            `/api/public/v2/scores?${queryUserName}&operator=<&value=50`,
            undefined,
            authentication,
          );
          expect(getScore.status).toBe(200);
          expect(getScore.body.meta).toMatchObject({
            page: 1,
            limit: 50,
            totalItems: 1,
            totalPages: 1,
          });
          expect(getScore.body.data).toMatchObject([
            {
              id: scoreId_1,
              name: scoreName,
              value: 10.5,
            },
          ]);
        });

        it("test operator >", async () => {
          const getScore = await makeZodVerifiedAPICall(
            GetScoresResponseV2,
            "GET",
            `/api/public/v2/scores?${queryUserName}&operator=>&value=100`,
            undefined,
            authentication,
          );
          expect(getScore.status).toBe(200);
          expect(getScore.body.meta).toMatchObject({
            page: 1,
            limit: 50,
            totalItems: 1,
            totalPages: 1,
          });
          expect(getScore.body.data).toMatchObject([
            {
              id: scoreId_3,
              name: scoreName,
              value: 100.8,
            },
          ]);
        });

        it("test operator <=", async () => {
          const getScore = await makeZodVerifiedAPICall(
            GetScoresResponseV2,
            "GET",
            `/api/public/v2/scores?${queryUserName}&operator=<=&value=50.5`,
            undefined,
            authentication,
          );
          expect(getScore.status).toBe(200);
          expect(getScore.body.meta).toMatchObject({
            page: 1,
            limit: 50,
            totalItems: 2,
            totalPages: 1,
          });
          expect(getScore.body.data).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: scoreId_2,
                name: scoreName,
                value: 50.5,
              }),
              expect.objectContaining({
                id: scoreId_1,
                name: scoreName,
                value: 10.5,
              }),
            ]),
          );
        });

        it("test operator >=", async () => {
          const getScore = await makeZodVerifiedAPICall(
            GetScoresResponseV2,
            "GET",
            `/api/public/v2/scores?${queryUserName}&operator=>=&value=50.5`,
            undefined,
            authentication,
          );
          expect(getScore.status).toBe(200);
          expect(getScore.body.meta).toMatchObject({
            page: 1,
            limit: 50,
            totalItems: 2,
            totalPages: 1,
          });
          expect(getScore.body.data).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: scoreId_3,
                name: scoreName,
                value: 100.8,
              }),
              expect.objectContaining({
                id: scoreId_2,
                name: scoreName,
                value: 50.5,
              }),
            ]),
          );
        });

        it("test operator !=", async () => {
          const getScore = await makeZodVerifiedAPICall(
            GetScoresResponseV2,
            "GET",
            `/api/public/v2/scores?${queryUserName}&operator=!=&value=50.5`,
            undefined,
            authentication,
          );
          expect(getScore.status).toBe(200);
          expect(getScore.body.meta).toMatchObject({
            page: 1,
            limit: 50,
            totalItems: 2,
            totalPages: 1,
          });
          expect(getScore.body.data).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: scoreId_3,
                name: scoreName,
                value: 100.8,
              }),
              expect.objectContaining({
                id: scoreId_1,
                name: scoreName,
                value: 10.5,
              }),
            ]),
          );
        });

        it("test operator =", async () => {
          const getScore = await makeZodVerifiedAPICall(
            GetScoresResponseV2,
            "GET",
            `/api/public/v2/scores?${queryUserName}&operator==&value=50.5`,
            undefined,
            authentication,
          );
          expect(getScore.status).toBe(200);
          expect(getScore.body.meta).toMatchObject({
            page: 1,
            limit: 50,
            totalItems: 1,
            totalPages: 1,
          });
          expect(getScore.body.data).toMatchObject([
            {
              id: scoreId_2,
              name: scoreName,
              value: 50.5,
            },
          ]);
        });

        it("test invalid operator", async () => {
          try {
            await makeZodVerifiedAPICall(
              z.object({
                message: z.string(),
                error: z.array(z.object({})),
              }),
              "GET",
              `/api/public/v2/scores?${queryUserName}&operator=op&value=50.5`,
              undefined,
              authentication,
            );
          } catch (error) {
            expect((error as Error).message).toBe(
              `API call did not return 200, returned status 400, body {\"message\":\"Invalid request data\",\"error\":[{\"code\":\"invalid_value\",\"values\":[\"<\",\">\",\"<=\",\">=\",\"!=\",\"=\"],\"path\":[\"operator\"],\"message\":\"Invalid option: expected one of \\\"<\\\"|\\\">\\\"|\\\"<=\\\"|\\\">=\\\"|\\\"!=\\\"|\\\"=\\\"\"}]}`,
            );
          }
        });

        it("test invalid value", async () => {
          try {
            await makeZodVerifiedAPICall(
              z.object({
                message: z.string(),
                error: z.array(z.object({})),
              }),
              "GET",
              `/api/public/v2/scores?${queryUserName}&operator=<&value=myvalue`,
              undefined,
              authentication,
            );
          } catch (error) {
            expect((error as Error).message).toBe(
              'API call did not return 200, returned status 400, body {"message":"Invalid request data","error":[{"expected":"number","code":"invalid_type","received":"NaN","path":["value"],"message":"Invalid input: expected number, received NaN"}]}',
            );
          }
        });
      });

      it("should filter scores by score IDs", async () => {
        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?scoreIds=${scoreId_1},${scoreId_2}`,
          undefined,
          authentication,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 2,
          totalPages: 1,
        });
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: scoreId_2,
              name: scoreName,
              value: 50.5,
            }),
            expect.objectContaining({
              id: scoreId_1,
              name: scoreName,
              value: 10.5,
            }),
          ]),
        );
      });

      it("should filter scores by session ID", async () => {
        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?sessionId=${sessionId}`,
          undefined,
          authentication,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 2,
          totalPages: 1,
        });
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: scoreId_6,
              sessionId: sessionId,
              name: scoreName,
              value: 100.5,
            }),
            expect.objectContaining({
              id: scoreId_7,
              sessionId: sessionId,
              name: "session-score-name",
              value: 100.5,
            }),
          ]),
        );
      });

      it("should filter scores by dataset run ID", async () => {
        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?datasetRunId=${runId}`,
          undefined,
          authentication,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 2,
          totalPages: 1,
        });
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: scoreId_8,
              datasetRunId: runId,
              name: scoreName,
              value: 100.5,
            }),
            expect.objectContaining({
              id: scoreId_9,
              datasetRunId: runId,
              name: scoreName,
              value: 100.5,
            }),
          ]),
        );
      });

      it("should filter scores by trace ID", async () => {
        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?traceId=${traceId}`,
          undefined,
          authentication,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 3,
          totalPages: 1,
        });
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: scoreId_1,
              traceId: traceId,
              name: scoreName,
              value: 10.5,
            }),
            expect.objectContaining({
              id: scoreId_2,
              traceId: traceId,
              name: scoreName,
              value: 50.5,
            }),
            expect.objectContaining({
              id: scoreId_3,
              traceId: traceId,
              name: scoreName,
              value: 100.8,
            }),
          ]),
        );
      });

      it("should filter scores by single observation ID", async () => {
        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?observationId=${generationId}`,
          undefined,
          authentication,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 3,
          totalPages: 1,
        });
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: scoreId_1,
              observationId: generationId,
              name: scoreName,
              value: 10.5,
            }),
            expect.objectContaining({
              id: scoreId_2,
              observationId: generationId,
              name: scoreName,
              value: 50.5,
            }),
            expect.objectContaining({
              id: scoreId_3,
              observationId: generationId,
              name: scoreName,
              value: 100.8,
            }),
          ]),
        );
      });

      it("should filter scores by multiple observation IDs", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const tId = v4();
        const obsId1 = v4();
        const obsId2 = v4();
        const obsId3 = v4();
        const sId1 = v4();
        const sId2 = v4();
        const sId3 = v4();

        await createTracesCh([createTrace({ id: tId, project_id: projectId })]);
        await createObservationsCh([
          createObservation({
            id: obsId1,
            project_id: projectId,
            type: "GENERATION",
          }),
          createObservation({
            id: obsId2,
            project_id: projectId,
            type: "GENERATION",
          }),
          createObservation({
            id: obsId3,
            project_id: projectId,
            type: "GENERATION",
          }),
        ]);
        await createScoresCh([
          createTraceScore({
            id: sId1,
            project_id: projectId,
            trace_id: tId,
            observation_id: obsId1,
            name: "score",
            value: 1,
            data_type: "NUMERIC",
          }),
          createTraceScore({
            id: sId2,
            project_id: projectId,
            trace_id: tId,
            observation_id: obsId2,
            name: "score",
            value: 2,
            data_type: "NUMERIC",
          }),
          createTraceScore({
            id: sId3,
            project_id: projectId,
            trace_id: tId,
            observation_id: obsId3,
            name: "score",
            value: 3,
            data_type: "NUMERIC",
          }),
        ]);

        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?observationId=${obsId1},${obsId2}`,
          undefined,
          auth,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 2,
          totalPages: 1,
        });
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: sId1,
              observationId: obsId1,
              value: 1,
            }),
            expect.objectContaining({
              id: sId2,
              observationId: obsId2,
              value: 2,
            }),
          ]),
        );
        expect(
          getScore.body.data.find((s: any) => s.id === sId3),
        ).toBeUndefined();
      });
    });

    describe("GET /api/public/v2/scores - fields parameter", () => {
      it("should include both score and trace by default (backward compatibility)", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
          user_id: "test-user",
          tags: ["tag1", "tag2"],
          environment: "production",
        });
        await createTracesCh([trace]);

        const score = createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 100,
          data_type: "NUMERIC",
        });
        await createScoresCh([score]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0]).toMatchObject({
          id: scoreId,
          name: "test-score",
          value: 100,
          trace: {
            userId: "test-user",
            tags: expect.arrayContaining(["tag1", "tag2"]),
            environment: "production",
          },
        });
      });

      it("should include both when fields=score,trace", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const traceSessionId = v4();
        const scoreId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
          session_id: traceSessionId,
          user_id: "test-user",
          tags: ["tag1"],
        });
        await createTracesCh([trace]);

        const score = createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 50,
          data_type: "NUMERIC",
        });
        await createScoresCh([score]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?fields=score,trace`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0]).toMatchObject({
          id: scoreId,
          name: "test-score",
          value: 50,
          trace: {
            userId: "test-user",
            tags: ["tag1"],
            sessionId: traceSessionId,
          },
        });
      });

      it("should exclude trace when fields=score only", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
          user_id: "test-user",
          tags: ["tag1", "tag2"],
        });
        await createTracesCh([trace]);

        const score = createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 75,
          data_type: "NUMERIC",
        });
        await createScoresCh([score]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?fields=score`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0]).toMatchObject({
          id: scoreId,
          name: "test-score",
          value: 75,
          trace: null,
        });
      });

      it("should handle empty fields as default (include trace)", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
          user_id: "test-user",
        });
        await createTracesCh([trace]);

        const score = createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 100,
          data_type: "NUMERIC",
        });
        await createScoresCh([score]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?fields=`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0]).toMatchObject({
          id: scoreId,
          trace: {
            userId: "test-user",
          },
        });
      });

      it("should handle session scores without trace when fields=score", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const sessionId = v4();
        const scoreId = v4();

        const score = createSessionScore({
          id: scoreId,
          project_id: projectId,
          session_id: sessionId,
          name: "session-score",
          value: 100,
          data_type: "NUMERIC",
        });
        await createScoresCh([score]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?sessionId=${sessionId}&fields=score`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0]).toMatchObject({
          id: scoreId,
          sessionId: sessionId,
          name: "session-score",
          value: 100,
          trace: null,
        });
      });

      it("should ignore invalid field groups", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
          user_id: "test-user",
          tags: ["tag1"],
        });
        await createTracesCh([trace]);

        const score = createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 100,
          data_type: "NUMERIC",
        });
        await createScoresCh([score]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?fields=score,trace,invalid,unknown`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0]).toMatchObject({
          id: scoreId,
          trace: {
            userId: "test-user",
            tags: ["tag1"],
          },
        });
      });

      it("should return 400 when requesting trace field without score field", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
          user_id: "test-user",
        });
        await createTracesCh([trace]);

        const score = createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 100,
          data_type: "NUMERIC",
        });
        await createScoresCh([score]);

        const response = await makeZodVerifiedAPICall(
          z.object({
            message: z.string(),
          }),
          "GET",
          `/api/public/v2/scores?fields=trace`,
          undefined,
          auth,
          400,
        );

        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          "Scores needs to be selected always",
        );
      });

      it("should handle multiple scores with fields=score", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId1 = v4();
        const scoreId2 = v4();
        const scoreId3 = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
          user_id: "test-user",
          tags: ["tag1", "tag2"],
        });
        await createTracesCh([trace]);

        const score1 = createTraceScore({
          id: scoreId1,
          project_id: projectId,
          trace_id: traceId,
          name: "score-1",
          value: 10,
          data_type: "NUMERIC",
        });
        const score2 = createTraceScore({
          id: scoreId2,
          project_id: projectId,
          trace_id: traceId,
          name: "score-2",
          value: 20,
          data_type: "NUMERIC",
        });
        const score3 = createTraceScore({
          id: scoreId3,
          project_id: projectId,
          trace_id: traceId,
          name: "score-3",
          value: 30,
          data_type: "NUMERIC",
        });
        await createScoresCh([score1, score2, score3]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?fields=score`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(3);
        // All scores should have trace as null
        for (const score of getScores.body.data) {
          expect(score.trace).toBeNull();
        }
      });
    });

    describe("GET /api/public/v2/scores - fields validation", () => {
      it("should return 400 when filtering by userId without trace field", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
          user_id: "test-user",
        });
        await createTracesCh([trace]);

        const score = createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 100,
          data_type: "NUMERIC",
        });
        await createScoresCh([score]);

        const response = await makeZodVerifiedAPICall(
          z.object({
            message: z.string(),
          }),
          "GET",
          `/api/public/v2/scores?fields=score&userId=test-user`,
          undefined,
          auth,
          400,
        );

        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          "Cannot filter by trace properties",
        );
      });

      it("should return 400 when filtering by traceTags without trace field", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
          tags: ["tag1"],
        });
        await createTracesCh([trace]);

        const score = createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 100,
          data_type: "NUMERIC",
        });
        await createScoresCh([score]);

        const response = await makeZodVerifiedAPICall(
          z.object({
            message: z.string(),
          }),
          "GET",
          `/api/public/v2/scores?fields=score&traceTags=tag1`,
          undefined,
          auth,
          400,
        );

        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          "Cannot filter by trace properties",
        );
      });

      it("should allow userId filter when trace field is included", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
          user_id: "test-user",
        });
        await createTracesCh([trace]);

        const score = createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 100,
          data_type: "NUMERIC",
        });
        await createScoresCh([score]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?fields=score,trace&userId=test-user`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0]).toMatchObject({
          id: scoreId,
          trace: {
            userId: "test-user",
          },
        });
      });

      it("should allow fields=score without trace filters", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
          user_id: "test-user",
        });
        await createTracesCh([trace]);

        const score = createTraceScore({
          id: scoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 100,
          data_type: "NUMERIC",
        });
        await createScoresCh([score]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?fields=score&name=test-score`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0]).toMatchObject({
          id: scoreId,
          trace: null,
        });
      });
    });

    describe("GET /api/public/v2/scores - filter parameter", () => {
      it("should filter scores by metadata key-value with stringObject filter", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId1 = v4();
        const scoreId2 = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
        });
        await createTracesCh([trace]);

        const score1 = createTraceScore({
          id: scoreId1,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 10,
          data_type: "NUMERIC",
          metadata: { user_id: "alice" },
        });
        const score2 = createTraceScore({
          id: scoreId2,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 20,
          data_type: "NUMERIC",
          metadata: { user_id: "bob" },
        });
        await createScoresCh([score1, score2]);

        const filterParam = JSON.stringify([
          {
            type: "stringObject",
            column: "metadata",
            key: "user_id",
            operator: "=",
            value: "alice",
          },
        ]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?filter=${encodeURIComponent(filterParam)}`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0].id).toBe(scoreId1);
      });

      it("should filter scores by metadata using contains operator", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId1 = v4();
        const scoreId2 = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
        });
        await createTracesCh([trace]);

        const score1 = createTraceScore({
          id: scoreId1,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 10,
          data_type: "NUMERIC",
          metadata: { region: "us-east-1" },
        });
        const score2 = createTraceScore({
          id: scoreId2,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 20,
          data_type: "NUMERIC",
          metadata: { region: "eu-west-1" },
        });
        await createScoresCh([score1, score2]);

        const filterParam = JSON.stringify([
          {
            type: "stringObject",
            column: "metadata",
            key: "region",
            operator: "contains",
            value: "us-east",
          },
        ]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?filter=${encodeURIComponent(filterParam)}`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0].id).toBe(scoreId1);
      });

      it("should return empty when no scores match metadata filter", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId1 = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
        });
        await createTracesCh([trace]);

        const score1 = createTraceScore({
          id: scoreId1,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score",
          value: 10,
          data_type: "NUMERIC",
          metadata: { team: "backend" },
        });
        await createScoresCh([score1]);

        const filterParam = JSON.stringify([
          {
            type: "stringObject",
            column: "metadata",
            key: "team",
            operator: "=",
            value: "frontend",
          },
        ]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?filter=${encodeURIComponent(filterParam)}`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(0);
      });

      it("should support multiple metadata filters with AND logic", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId1 = v4();
        const scoreId2 = v4();
        const scoreId3 = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
        });
        await createTracesCh([trace]);

        const score1 = createTraceScore({
          id: scoreId1,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score-1",
          value: 10,
          data_type: "NUMERIC",
          metadata: { env: "prod", team: "backend" },
        });
        const score2 = createTraceScore({
          id: scoreId2,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score-2",
          value: 20,
          data_type: "NUMERIC",
          metadata: { env: "prod", team: "frontend" },
        });
        const score3 = createTraceScore({
          id: scoreId3,
          project_id: projectId,
          trace_id: traceId,
          name: "test-score-3",
          value: 30,
          data_type: "NUMERIC",
          metadata: { env: "staging", team: "backend" },
        });
        await createScoresCh([score1, score2, score3]);

        const filterParam = JSON.stringify([
          {
            type: "stringObject",
            column: "metadata",
            key: "env",
            operator: "=",
            value: "prod",
          },
          {
            type: "stringObject",
            column: "metadata",
            key: "team",
            operator: "=",
            value: "backend",
          },
        ]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?filter=${encodeURIComponent(filterParam)}`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0].id).toBe(scoreId1);
      });

      it("should combine metadata filter with simple query parameters", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId1 = v4();
        const scoreId2 = v4();
        const scoreId3 = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
        });
        await createTracesCh([trace]);

        const score1 = createTraceScore({
          id: scoreId1,
          project_id: projectId,
          trace_id: traceId,
          name: "accuracy",
          value: 90,
          data_type: "NUMERIC",
          metadata: { user_id: "alice" },
        });
        const score2 = createTraceScore({
          id: scoreId2,
          project_id: projectId,
          trace_id: traceId,
          name: "accuracy",
          value: 80,
          data_type: "NUMERIC",
          metadata: { user_id: "bob" },
        });
        const score3 = createTraceScore({
          id: scoreId3,
          project_id: projectId,
          trace_id: traceId,
          name: "latency",
          value: 50,
          data_type: "NUMERIC",
          metadata: { user_id: "alice" },
        });
        await createScoresCh([score1, score2, score3]);

        const filterParam = JSON.stringify([
          {
            type: "stringObject",
            column: "metadata",
            key: "user_id",
            operator: "=",
            value: "alice",
          },
        ]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?name=accuracy&filter=${encodeURIComponent(filterParam)}`,
          undefined,
          auth,
        );

        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0].id).toBe(scoreId1);
      });

      it("should let advanced filter take precedence over simple param for same field", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();
        const scoreId1 = v4();
        const scoreId2 = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
        });
        await createTracesCh([trace]);

        const score1 = createTraceScore({
          id: scoreId1,
          project_id: projectId,
          trace_id: traceId,
          name: "accuracy",
          value: 90,
          data_type: "NUMERIC",
        });
        const score2 = createTraceScore({
          id: scoreId2,
          project_id: projectId,
          trace_id: traceId,
          name: "latency",
          value: 50,
          data_type: "NUMERIC",
        });
        await createScoresCh([score1, score2]);

        // Simple param says name=accuracy, but advanced filter overrides to name=latency
        const filterParam = JSON.stringify([
          {
            type: "string",
            column: "name",
            operator: "=",
            value: "latency",
          },
        ]);

        const getScores = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?name=accuracy&filter=${encodeURIComponent(filterParam)}`,
          undefined,
          auth,
        );

        // Advanced filter wins: should return "latency", not "accuracy"
        expect(getScores.status).toBe(200);
        expect(getScores.body.data).toHaveLength(1);
        expect(getScores.body.data[0].id).toBe(scoreId2);
        expect(getScores.body.data[0].name).toBe("latency");
      });
    });
  });
});
