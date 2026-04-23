import {
  createObservation,
  createTraceScore,
  createTrace,
  createSessionScore,
  getScoresByIds,
  getScoreById,
  createEvent,
} from "@langfuse/shared/src/server";
import {
  createObservationsCh,
  createScoresCh,
  createTracesCh,
  createEventsCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  DeleteScoreResponseV1,
  GetScoreResponseV1,
  GetScoresResponseV1,
} from "@langfuse/shared";
import { v4 } from "uuid";
import { z } from "zod";
import waitForExpect from "wait-for-expect";
import { env } from "@/src/env.mjs";
import { V4_DEFAULT_ENABLED_FROM_AT } from "@/src/features/events/lib/v4Rollout";

describe("/api/public/scores API Endpoint", () => {
  describe("GET /api/public/scores/:scoreId", () => {
    it("should GET a score", async () => {
      const { projectId: projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const traceId = v4();
      const score = createTraceScore({
        id: scoreId,
        environment: "default",
        project_id: projectId,
        trace_id: traceId,
        name: "Test Score",
        timestamp: Date.now(),
        observation_id: v4(),
        value: 100.5,
        source: "API",
        comment: "comment",
        metadata: { "test-key": "test-value" },
        data_type: "NUMERIC" as const,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
        is_deleted: 0,
      });

      await createScoresCh([score]);

      const getScore = await makeZodVerifiedAPICall(
        GetScoreResponseV1,
        "GET",
        `/api/public/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(getScore.status).toBe(200);
      expect(getScore.body).toMatchObject({
        id: scoreId,
        name: "Test Score",
        value: 100.5,
        comment: "comment",
        metadata: { "test-key": "test-value" },
        source: "API",
        traceId,
        observationId: score.observation_id,
        dataType: "NUMERIC",
      });
    });

    it("should GET a text score", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const traceId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: traceId,
        name: "Text Score",
        timestamp: Date.now(),
        value: 0,
        string_value: "Great explanation",
        source: "API",
        comment: "comment",
        data_type: "TEXT" as const,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
        is_deleted: 0,
      });

      await createScoresCh([score]);

      const getScore = await makeZodVerifiedAPICall(
        GetScoreResponseV1,
        "GET",
        `/api/public/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(getScore.status).toBe(200);
      expect(getScore.body).toMatchObject({
        id: scoreId,
        name: "Text Score",
        stringValue: "Great explanation",
        comment: "comment",
        source: "API",
        traceId,
        dataType: "TEXT",
      });
      expect(getScore.body).not.toHaveProperty("value");
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
        GetScoreResponseV1,
        "GET",
        `/api/public/scores/${minimalScoreId}`,
        undefined,
        auth,
      );

      expect(fetchedScore.status).toBe(200);
    });
  });

  describe("DELETE /api/public/scores/:scoreId", () => {
    it("should delete a score", async () => {
      // Setup
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();

      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
      });
      await createScoresCh([score]);

      // When
      const deleteResponse = await makeZodVerifiedAPICall(
        DeleteScoreResponseV1,
        "DELETE",
        `/api/public/scores/${scoreId}`,
        undefined,
        auth,
        202,
      );

      // Then
      expect(deleteResponse.status).toBe(202);
      await waitForExpect(async () => {
        const scores = await getScoresByIds(projectId, [scoreId]);
        expect(scores).toHaveLength(0);
      });
    });
  });

  describe("POST /api/public/scores", () => {
    it("should create score for a trace", async () => {
      const traceId = v4();

      const { projectId: projectId, auth } = await createOrgProjectAndApiKey();

      const trace = createTrace({
        id: traceId,
        project_id: projectId,
      });
      await createTracesCh([trace]);

      const scoreId = v4();

      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: traceId,
        name: "score-name",
        value: 100.5,
        source: "API",
        comment: "comment",
        metadata: { "test-key": "test-value" },
        observation_id: null,
        environment: "production",
      });
      await createScoresCh([score]);

      const fetchedScore = await makeZodVerifiedAPICall(
        GetScoreResponseV1,
        "GET",
        `/api/public/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(fetchedScore.body?.id).toBe(scoreId);
      expect(fetchedScore.body?.traceId).toBe(traceId);
      expect(fetchedScore.body?.name).toBe("score-name");
      expect(fetchedScore.body?.value).toBe(100.5);
      expect(fetchedScore.body?.observationId).toBeNull();
      expect(fetchedScore.body?.comment).toBe("comment");
      expect(fetchedScore.body?.source).toBe("API");
      expect(fetchedScore.body?.projectId).toBe(projectId);
      expect(fetchedScore.body?.environment).toBe("production");
      expect(fetchedScore.body?.metadata).toEqual({ "test-key": "test-value" });
    });

    it("should update score for a trace", async () => {
      const traceId = v4();

      const { projectId: projectId, auth } = await createOrgProjectAndApiKey();

      const trace = createTrace({
        id: traceId,
        project_id: projectId,
      });
      await createTracesCh([trace]);

      const scoreId = v4();

      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: traceId,
        name: "score-name",
        value: 100.5,
        source: "API",
        comment: "comment",
        metadata: { "test-key": "test-value" },
        observation_id: null,
        environment: "production",
      });
      await createScoresCh([score]);

      const updatedScore = {
        ...score,
        value: 200.5,
        metadata: { "test-key": "test-value-updated" },
      };
      await createScoresCh([updatedScore]);

      const fetchedScore = await makeZodVerifiedAPICall(
        GetScoreResponseV1,
        "GET",
        `/api/public/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(fetchedScore.body?.id).toBe(scoreId);
      expect(fetchedScore.body?.traceId).toBe(traceId);
      expect(fetchedScore.body?.name).toBe("score-name");
      expect(fetchedScore.body?.value).toBe(200.5);
      expect(fetchedScore.body?.observationId).toBeNull();
      expect(fetchedScore.body?.comment).toBe("comment");
      expect(fetchedScore.body?.source).toBe("API");
      expect(fetchedScore.body?.projectId).toBe(projectId);
      expect(fetchedScore.body?.environment).toBe("production");
      expect(fetchedScore.body?.metadata).toEqual({
        "test-key": "test-value-updated",
      });
    });

    it("should post score with score config and queue id if in valid range", async () => {
      const configId = v4();
      const traceId = v4();
      const scoreId = v4();
      const queueId = v4();

      const { projectId: projectId, auth } = await createOrgProjectAndApiKey();

      const config = await prisma.scoreConfig.create({
        data: {
          name: "score-name",
          id: configId,
          dataType: "NUMERIC",
          maxValue: 100,
          projectId: projectId,
        },
      });

      const trace = createTrace({
        id: traceId,
        project_id: projectId,
      });
      await createTracesCh([trace]);

      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: traceId,
        name: "score-name",
        value: 100,
        source: "API",
        comment: "comment",
        metadata: { "test-key": "test-value" },
        observation_id: null,
        environment: "production",
        config_id: config.id,
        queue_id: queueId,
      });
      await createScoresCh([score]);

      const fetchedScore = await makeZodVerifiedAPICall(
        GetScoreResponseV1,
        "GET",
        `/api/public/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(fetchedScore.body?.id).toBe(scoreId);
      expect(fetchedScore.body?.traceId).toBe(traceId);
      expect(fetchedScore.body?.name).toBe("score-name");
      expect(fetchedScore.body?.value).toBe(100);
      expect(fetchedScore.body?.configId).toBe(configId);
      expect(fetchedScore.body?.observationId).toBeNull();
      expect(fetchedScore.body?.comment).toBe("comment");
      expect(fetchedScore.body?.source).toBe("API");
      expect(fetchedScore.body?.projectId).toBe(projectId);
      expect(fetchedScore.body?.environment).toBe("production");
      expect(fetchedScore.body?.queueId).toBe(queueId);
      expect(fetchedScore.body?.metadata).toEqual({
        "test-key": "test-value",
      });
    });
  });

  describe("GET /api/public/scores", () => {
    it("#6396: should correctly list 100s of scores", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      // Create a trace to associate with all scores
      const traceId = v4();
      const trace = createTrace({
        id: traceId,
        project_id: projectId,
      });
      await createTracesCh([trace]);

      // Create observation to associate with scores
      const observationId = v4();
      const observation = createObservation({
        id: observationId,
        project_id: projectId,
        type: "GENERATION",
      });
      await createObservationsCh([observation]);

      // Create about 200 scores
      const totalScores = 220;
      const scores = [];

      for (let i = 0; i < totalScores; i++) {
        scores.push(
          createTraceScore({
            id: v4(),
            project_id: projectId,
            trace_id: traceId,
            name: `score-${i}`,
            value: i,
            data_type: "NUMERIC",
            observation_id: observationId,
          }),
        );
      }

      await createScoresCh(scores);

      // Define page size smaller than total to ensure pagination
      const pageSize = 50;
      let page = 1;
      let totalFetched = 0;
      let hasMorePages = true;

      // Fetch all pages and verify count matches
      while (hasMorePages) {
        const response = await makeZodVerifiedAPICall(
          GetScoresResponseV1,
          "GET",
          `/api/public/scores?limit=${pageSize}&page=${page}`,
          undefined,
          auth,
        );

        expect(response.status).toBe(200);

        // Verify metadata is accurate
        expect(response.body.meta).toMatchObject({
          page,
          limit: pageSize,
          totalItems: totalScores,
          totalPages: 5, // totalScores / pageSize
        });

        // Count fetched items
        totalFetched += response.body.data.length;

        for (const score of response.body.data) {
          expect(score).toMatchObject({
            traceId,
            observationId,
            dataType: "NUMERIC",
          });
          expect(score.name).toMatch(/^score-\d+$/);
          expect(score.value).toBe(parseInt(score.name.split("-")[1]));
        }

        // Check if we need to fetch more pages
        hasMorePages = page <= response.body.meta.totalPages;
        page++;
      }

      // Verify we fetched exactly the number of scores we created
      expect(totalFetched).toBe(totalScores);
    });

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
      const datasetRunId = v4();
      const scoreId_1 = v4();
      const scoreId_2 = v4();
      const scoreId_3 = v4();
      const scoreId_4 = v4();
      const scoreId_5 = v4();
      const scoreId_6 = v4();
      const scoreId_7 = v4();
      const textScoreId_1 = v4();
      const textScoreId_2 = v4();
      let authentication: string;
      let newProjectId: string;

      beforeEach(async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        authentication = auth;
        newProjectId = projectId;

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

        const textScore1 = createTraceScore({
          id: textScoreId_1,
          project_id: newProjectId,
          trace_id: traceId_2,
          name: "text-score-name",
          data_type: "TEXT",
          string_value: "text-value-1",
          value: 0,
        });

        const textScore2 = createTraceScore({
          id: textScoreId_2,
          project_id: newProjectId,
          trace_id: traceId_3,
          name: "text-score-name",
          data_type: "TEXT",
          string_value: "text-value-2",
          value: 0,
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

        await createScoresCh([
          score1,
          score2,
          score3,
          score4,
          score5,
          textScore1,
          textScore2,
          sessionScore1,
          sessionScore2,
        ]);
      });

      it("get all trace scores", async () => {
        const getAllScore = await makeZodVerifiedAPICall(
          GetScoresResponseV1,
          "GET",
          `/api/public/scores`,
          undefined,
          authentication,
        );
        expect(getAllScore.status).toBe(200);
        expect(getAllScore.body.meta).toMatchObject({
          page: 1,
          limit: 50,
          totalItems: 7, // 9 scores in total, but only 7 are trace scores
          totalPages: 1,
        });
        for (const val of getAllScore.body.data) {
          expect(val).toMatchObject({
            traceId: expect.any(String),
          });
        }
      });

      it("get all scores for config", async () => {
        const getAllScore = await makeZodVerifiedAPICall(
          GetScoresResponseV1,
          "GET",
          `/api/public/scores?configId=${configId}`,
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
          GetScoresResponseV1,
          "GET",
          `/api/public/scores?dataType=NUMERIC`,
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
          expect(val).toMatchObject({
            traceId: traceId,
            observationId: generationId,
            dataType: "NUMERIC",
          });
        }
      });

      it("get all scores for text data type", async () => {
        const getAllScore = await makeZodVerifiedAPICall(
          GetScoresResponseV1,
          "GET",
          `/api/public/scores?dataType=TEXT`,
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
            dataType: "TEXT",
            name: "text-score-name",
          });
          expect(val.stringValue).toContain("text-value");
        }
      });

      it("get all scores for trace tag 'prod'", async () => {
        const getAllScore = await makeZodVerifiedAPICall(
          GetScoresResponseV1,
          "GET",
          `/api/public/scores?traceTags=prod`,
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
          GetScoresResponseV1,
          "GET",
          `/api/public/scores?environment=production`,
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

      it("get all scores for trace tags 'staging' and 'dev'", async () => {
        const getAllScore = await makeZodVerifiedAPICall(
          GetScoresResponseV1,
          "GET",
          `/api/public/scores?traceTags=${["staging", "dev"]}`,
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
              GetScoresResponseV1,
              "GET",
              `/api/public/scores?queueId=${queueId}`,
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
            GetScoresResponseV1,
            "GET",
            `/api/public/scores?${queryUserName}&operator=<`,
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
            GetScoresResponseV1,
            "GET",
            `/api/public/scores?${queryUserName}&value=0.8`,
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
            GetScoresResponseV1,
            "GET",
            `/api/public/scores?${queryUserName}&operator=<&value=50`,
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
            GetScoresResponseV1,
            "GET",
            `/api/public/scores?${queryUserName}&operator=>&value=100`,
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
            GetScoresResponseV1,
            "GET",
            `/api/public/scores?${queryUserName}&operator=<=&value=50.5`,
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
            GetScoresResponseV1,
            "GET",
            `/api/public/scores?${queryUserName}&operator=>=&value=50.5`,
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
            GetScoresResponseV1,
            "GET",
            `/api/public/scores?${queryUserName}&operator=!=&value=50.5`,
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
            GetScoresResponseV1,
            "GET",
            `/api/public/scores?${queryUserName}&operator==&value=50.5`,
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
              `/api/public/scores?${queryUserName}&operator=op&value=50.5`,
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
              `/api/public/scores?${queryUserName}&operator=<&value=myvalue`,
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
          GetScoresResponseV1,
          "GET",
          `/api/public/scores?scoreIds=${scoreId_1},${scoreId_2}`,
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

      it("should reject session ID filtering", async () => {
        try {
          await makeAPICall(
            "GET",
            `/api/public/scores?sessionId=${sessionId}`,
            undefined,
            authentication,
          );
        } catch (error) {
          expect((error as Error).message).toContain(
            "API call did not return 200, returned status 400",
          );
        }
      });

      it("should reject dataset run ID filtering", async () => {
        try {
          await makeAPICall(
            "GET",
            `/api/public/scores?datasetRunId=${datasetRunId}`,
            undefined,
            authentication,
          );
        } catch (error) {
          expect((error as Error).message).toContain(
            "API call did not return 200, returned status 400",
          );
        }
      });

      it("should reject trace ID filtering", async () => {
        try {
          await makeAPICall(
            "GET",
            `/api/public/scores?traceId=${traceId}`,
            undefined,
            authentication,
          );
        } catch (error) {
          expect((error as Error).message).toContain(
            "API call did not return 200, returned status 400",
          );
        }
      });

      it("should reject CORRECTION data type filtering", async () => {
        try {
          await makeAPICall(
            "GET",
            `/api/public/scores?dataType=CORRECTION`,
            undefined,
            authentication,
          );
        } catch (error) {
          expect((error as Error).message).toContain(
            "API call did not return 200, returned status 400",
          );
        }
      });

      it("should exclude CORRECTION scores from list when no dataType filter is provided", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
        });
        await createTracesCh([trace]);

        // Create a NUMERIC score (should be returned)
        const numericScoreId = v4();
        const numericScore = createTraceScore({
          id: numericScoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "numeric-score",
          value: 95.5,
          source: "API",
          data_type: "NUMERIC" as const,
        });

        // Create a CORRECTION score (should NOT be returned)
        const correctionScoreId = v4();
        const correctionScore = createTraceScore({
          id: correctionScoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "correction-score",
          value: 0,
          source: "ANNOTATION",
          data_type: "CORRECTION" as const,
          string_value: null,
          long_string_value: "This is a correction",
        });

        await createScoresCh([numericScore, correctionScore]);

        // Wait for scores to be available
        // Note: getScoresByIds only returns aggregatable scores, so we only check for the NUMERIC score
        await waitForExpect(async () => {
          const checkScores = await getScoresByIds(projectId, [numericScoreId]);
          expect(checkScores).toHaveLength(1);
        });

        // Fetch all scores without filter - should only get NUMERIC
        const response = await makeZodVerifiedAPICall(
          GetScoresResponseV1,
          "GET",
          `/api/public/scores?page=1&limit=10`,
          undefined,
          auth,
        );

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].id).toBe(numericScoreId);
        expect(response.body.data[0].dataType).toBe("NUMERIC");
        expect(response.body.meta.totalItems).toBe(1);

        // Verify CORRECTION score is NOT in the results
        const correctionInResults = response.body.data.find(
          (s) => s.id === correctionScoreId,
        );
        expect(correctionInResults).toBeUndefined();
      });

      it("should not return CORRECTION score when fetching by ID", async () => {
        const { projectId, auth } = await createOrgProjectAndApiKey();
        const traceId = v4();

        const trace = createTrace({
          id: traceId,
          project_id: projectId,
        });
        await createTracesCh([trace]);

        // Create a CORRECTION score
        const correctionScoreId = v4();
        const correctionScore = createTraceScore({
          id: correctionScoreId,
          project_id: projectId,
          trace_id: traceId,
          name: "correction-score",
          value: 0,
          source: "ANNOTATION",
          data_type: "CORRECTION" as const,
          string_value: null,
          long_string_value: "This is a correction",
        });
        await createScoresCh([correctionScore]);

        // Wait for score to be available
        await waitForExpect(async () => {
          const checkScore = await getScoresByIds(projectId, [
            correctionScoreId,
          ]);
          expect(checkScore).toHaveLength(0);
        });

        // Try to fetch by ID - should return 404 since v1 doesn't support CORRECTION
        const response = await makeAPICall(
          "GET",
          `/api/public/scores/${correctionScoreId}`,
          undefined,
          auth,
        );
        expect(response.status).toBe(404);
      });
    });
  });

  describe("Bearer auth (public key only)", () => {
    it("should create a score via POST /api/public/scores with Bearer public key", async () => {
      const { projectId, publicKey } = await createOrgProjectAndApiKey();
      const traceId = v4();
      const trace = createTrace({ id: traceId, project_id: projectId });
      await createTracesCh([trace]);

      const scoreId = v4();
      const response = await makeAPICall(
        "POST",
        "/api/public/scores",
        {
          id: scoreId,
          traceId,
          name: "feedback",
          value: 1,
        },
        `Bearer ${publicKey}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id", scoreId);

      await waitForExpect(async () => {
        const score = await getScoreById({ projectId, scoreId });
        expect(score).toBeDefined();
        expect(score!.id).toBe(scoreId);
        expect(score!.traceId).toBe(traceId);
        expect(score!.name).toBe("feedback");
        expect(score!.value).toBe(1);
      });
    });

    it("should reject GET /api/public/scores with Bearer public key", async () => {
      const { publicKey } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "GET",
        "/api/public/scores",
        undefined,
        `Bearer ${publicKey}`,
      );

      expect(response.status).toBe(403);
    });

    it("should reject GET /api/public/scores/:scoreId with Bearer public key", async () => {
      const { publicKey } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "GET",
        `/api/public/scores/${v4()}`,
        undefined,
        `Bearer ${publicKey}`,
      );

      expect(response.status).toBe(403);
    });

    it("should reject DELETE /api/public/scores/:scoreId with Bearer public key", async () => {
      const { publicKey } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "DELETE",
        `/api/public/scores/${v4()}`,
        undefined,
        `Bearer ${publicKey}`,
      );

      expect(response.status).toBe(403);
    });

    it("should reject POST /api/public/scores with invalid Bearer token", async () => {
      const response = await makeAPICall(
        "POST",
        "/api/public/scores",
        {
          traceId: v4(),
          name: "feedback",
          value: 1,
        },
        `Bearer pk-invalid-key-that-does-not-exist`,
      );

      expect(response.status).toBe(401);
    });

    it("should reject Bearer public key on non-scores endpoints", async () => {
      const { publicKey } = await createOrgProjectAndApiKey();

      const [tracesRes, observationsRes, sessionsRes] = await Promise.all([
        makeAPICall(
          "GET",
          "/api/public/traces",
          undefined,
          `Bearer ${publicKey}`,
        ),
        makeAPICall(
          "GET",
          "/api/public/observations",
          undefined,
          `Bearer ${publicKey}`,
        ),
        makeAPICall(
          "GET",
          "/api/public/sessions",
          undefined,
          `Bearer ${publicKey}`,
        ),
      ]);

      expect(tracesRes.status).toBe(403);
      expect(observationsRes.status).toBe(403);
      expect(sessionsRes.status).toBe(403);
    });
  });

  describe("POST /api/public/scores source field", () => {
    it("defaults source to API when omitted", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
      const traceId = v4();
      await createTracesCh([
        createTrace({ id: traceId, project_id: projectId }),
      ]);

      const scoreId = v4();
      const response = await makeAPICall(
        "POST",
        "/api/public/scores",
        { id: scoreId, traceId, name: "feedback", value: 1 },
        auth,
      );

      expect(response.status).toBe(200);

      await waitForExpect(async () => {
        const score = await getScoreById({ projectId, scoreId });
        expect(score).toBeDefined();
        expect(score!.source).toBe("API");
      });
    }, 15000);

    it("rejects source=EVAL (reserved for internal evaluator outputs)", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
      const traceId = v4();
      await createTracesCh([
        createTrace({ id: traceId, project_id: projectId }),
      ]);

      const response = await makeAPICall(
        "POST",
        "/api/public/scores",
        {
          id: v4(),
          traceId,
          name: "llm-judge",
          value: 0.8,
          source: "EVAL",
        },
        auth,
      );

      expect(response.status).toBe(400);
    });

    it("accepts source=ANNOTATION with a matching configId", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
      const configId = v4();
      await prisma.scoreConfig.create({
        data: {
          id: configId,
          name: "helpfulness",
          dataType: "NUMERIC",
          maxValue: 1,
          projectId,
        },
      });

      const traceId = v4();
      await createTracesCh([
        createTrace({ id: traceId, project_id: projectId }),
      ]);

      const scoreId = v4();
      const response = await makeAPICall(
        "POST",
        "/api/public/scores",
        {
          id: scoreId,
          traceId,
          name: "helpfulness",
          value: 0.9,
          dataType: "NUMERIC",
          configId,
          source: "ANNOTATION",
        },
        auth,
      );

      expect(response.status).toBe(200);

      await waitForExpect(async () => {
        const score = await getScoreById({ projectId, scoreId });
        expect(score).toBeDefined();
        expect(score!.source).toBe("ANNOTATION");
        expect(score!.configId).toBe(configId);
        expect(score!.authorUserId).toBeNull();
      });
    }, 15000);

    it("rejects source=ANNOTATION without a configId", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
      const traceId = v4();
      await createTracesCh([
        createTrace({ id: traceId, project_id: projectId }),
      ]);

      const response = await makeAPICall(
        "POST",
        "/api/public/scores",
        {
          id: v4(),
          traceId,
          name: "helpfulness",
          value: 0.9,
          dataType: "NUMERIC",
          source: "ANNOTATION",
        },
        auth,
      );

      expect(response.status).toBe(400);
    });

    it("accepts source=ANNOTATION for CORRECTION scores without a configId", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();
      const traceId = v4();
      await createTracesCh([
        createTrace({ id: traceId, project_id: projectId }),
      ]);

      const scoreId = v4();
      const response = await makeAPICall(
        "POST",
        "/api/public/scores",
        {
          id: scoreId,
          traceId,
          name: "output",
          value: "The corrected output",
          dataType: "CORRECTION",
          source: "ANNOTATION",
        },
        auth,
      );

      expect(response.status).toBe(200);

      await waitForExpect(
        async () => {
          const score = await getScoreById({ projectId, scoreId });
          expect(score).toBeDefined();
          expect(score!.source).toBe("ANNOTATION");
          expect(score!.dataType).toBe("CORRECTION");
        },
        10000,
        500,
      );
    }, 15000);
  });

  // Dual-path tests: events table vs physical traces table.
  // Legacy suite: seeded project, no query param override.
  // Events suite: seeded project + useEventsTable=true query param override.
  (env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
    ? describe
    : describe.skip)(
    "GET /api/public/scores - Events Table Migration Tests",
    () => {
      const seedProjectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

      const runTestSuite = (useEventsTable: boolean) => {
        const suiteName = useEventsTable
          ? "with events table"
          : "with traces table";
        const eventsParam = useEventsTable ? "&useEventsTable=true" : "";

        describe(`${suiteName}`, () => {
          it("should return scores with trace metadata", async () => {
            const traceId = v4();
            const userId = "test-user-events";
            const traceTags = ["events-tag1", "events-tag2"];

            const trace = createTrace({
              id: traceId,
              project_id: seedProjectId,
              user_id: userId,
              tags: traceTags,
              environment: "production",
            });
            await createTracesCh([trace]);

            if (useEventsTable) {
              const eventId = v4();
              const rootEvent = createEvent({
                id: eventId,
                span_id: eventId,
                parent_span_id: null,
                trace_id: traceId,
                project_id: seedProjectId,
                name: "trace",
                trace_name: "trace",
                type: "GENERATION",
                start_time: Date.now() * 1000,
                environment: "production",
                user_id: userId,
                tags: traceTags,
              });
              await createEventsCh([rootEvent] as any);
            }

            const scoreName = `events-test-score-${v4()}`;
            const scoreId = v4();
            const score = createTraceScore({
              id: scoreId,
              project_id: seedProjectId,
              trace_id: traceId,
              name: scoreName,
              value: 42,
              data_type: "NUMERIC",
              source: "API",
            });
            await createScoresCh([score]);

            const response = await makeZodVerifiedAPICall(
              GetScoresResponseV1,
              "GET",
              `/api/public/scores?name=${scoreName}${eventsParam}`,
              undefined,
              undefined,
            );

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0]).toMatchObject({
              id: scoreId,
              name: scoreName,
              value: 42,
              traceId,
            });
            expect(response.body.data[0].trace).toMatchObject({
              userId,
              tags: expect.arrayContaining(traceTags),
            });
            expect(response.body.meta.totalItems).toBe(1);
          });

          it("should filter by userId through trace metadata", async () => {
            const traceId1 = v4();
            const traceId2 = v4();
            const targetUser = `target-user-${v4()}`;

            const trace1 = createTrace({
              id: traceId1,
              project_id: seedProjectId,
              user_id: targetUser,
            });
            const trace2 = createTrace({
              id: traceId2,
              project_id: seedProjectId,
              user_id: "other-user",
            });
            await createTracesCh([trace1, trace2]);

            if (useEventsTable) {
              const eid1 = v4();
              const eid2 = v4();
              await createEventsCh([
                createEvent({
                  id: eid1,
                  span_id: eid1,
                  parent_span_id: null,
                  trace_id: traceId1,
                  project_id: seedProjectId,
                  name: "trace",
                  trace_name: "trace",
                  type: "GENERATION",
                  start_time: Date.now() * 1000,
                  user_id: targetUser,
                }),
                createEvent({
                  id: eid2,
                  span_id: eid2,
                  parent_span_id: null,
                  trace_id: traceId2,
                  project_id: seedProjectId,
                  name: "trace",
                  trace_name: "trace",
                  type: "GENERATION",
                  start_time: Date.now() * 1000,
                  user_id: "other-user",
                }),
              ] as any);
            }

            const scoreName = `filter-test-${v4()}`;
            const score1 = createTraceScore({
              id: v4(),
              project_id: seedProjectId,
              trace_id: traceId1,
              name: scoreName,
              value: 1,
              source: "API",
            });
            const score2 = createTraceScore({
              id: v4(),
              project_id: seedProjectId,
              trace_id: traceId2,
              name: scoreName,
              value: 2,
              source: "API",
            });
            await createScoresCh([score1, score2]);

            const response = await makeZodVerifiedAPICall(
              GetScoresResponseV1,
              "GET",
              `/api/public/scores?userId=${targetUser}&name=${scoreName}${eventsParam}`,
              undefined,
              undefined,
            );

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].traceId).toBe(traceId1);
            expect(response.body.data[0].value).toBe(1);
            expect(response.body.meta.totalItems).toBe(1);
          });

          it("should return correct pagination metadata", async () => {
            const traceId = v4();
            const trace = createTrace({
              id: traceId,
              project_id: seedProjectId,
            });
            await createTracesCh([trace]);

            if (useEventsTable) {
              const eid = v4();
              await createEventsCh([
                createEvent({
                  id: eid,
                  span_id: eid,
                  parent_span_id: null,
                  trace_id: traceId,
                  project_id: seedProjectId,
                  name: "trace",
                  trace_name: "trace",
                  type: "GENERATION",
                  start_time: Date.now() * 1000,
                }),
              ] as any);
            }

            const scoreName = `pagination-test-${v4()}`;
            const scores = Array.from({ length: 3 }, () =>
              createTraceScore({
                id: v4(),
                project_id: seedProjectId,
                trace_id: traceId,
                name: scoreName,
                value: Math.random() * 100,
                source: "API",
              }),
            );
            await createScoresCh(scores);

            const response = await makeZodVerifiedAPICall(
              GetScoresResponseV1,
              "GET",
              `/api/public/scores?name=${scoreName}&limit=2&page=1${eventsParam}`,
              undefined,
              undefined,
            );

            expect(response.status).toBe(200);
            expect(response.body.data).toHaveLength(2);
            expect(response.body.meta.totalItems).toBe(3);
            expect(response.body.meta.totalPages).toBe(2);
          });
        });
      };

      runTestSuite(false); // seeded project, no override → legacy traces table
      runTestSuite(true); // seeded project + useEventsTable=true → events CTE
    },
  );

  // Verify org createdAt date-based routing works without useEventsTable query param.
  // Post-cutoff org → events path; pre-cutoff org → legacy path.
  // Each test populates ONLY the table its expected path reads from,
  // so using the wrong path causes a missing-data failure.
  (env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
    ? describe
    : describe.skip)("scores org createdAt routing", () => {
    const setupOrgWithDate = async (createdAt: Date) => {
      const result = await createOrgProjectAndApiKey();
      await prisma.organization.update({
        where: { id: result.orgId },
        data: { createdAt },
      });
      return result;
    };

    it("post-cutoff org routes to events path", async () => {
      const { projectId: pid, auth } = await setupOrgWithDate(
        new Date(V4_DEFAULT_ENABLED_FROM_AT.getTime() + 1000),
      );
      const traceId = v4();
      const scoreName = `ev-${v4()}`;

      await createTracesCh([
        createTrace({ id: traceId, project_id: pid, user_id: "u1" }),
      ]);
      const eid = v4();
      await createEventsCh([
        createEvent({
          id: eid,
          span_id: eid,
          parent_span_id: null,
          trace_id: traceId,
          project_id: pid,
          name: "t",
          trace_name: "t",
          type: "GENERATION",
          start_time: Date.now() * 1000,
          user_id: "u1",
        }),
      ] as any);
      await createScoresCh([
        createTraceScore({
          id: v4(),
          project_id: pid,
          trace_id: traceId,
          name: scoreName,
          value: 1,
          source: "API",
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV1,
        "GET",
        `/api/public/scores?name=${scoreName}`,
        undefined,
        auth,
      );
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].trace).toMatchObject({ userId: "u1" });
    });

    it("pre-cutoff org routes to legacy path", async () => {
      const { projectId: pid, auth } = await setupOrgWithDate(
        new Date("2020-01-01"),
      );
      const traceId = v4();
      const scoreName = `leg-${v4()}`;

      await createTracesCh([
        createTrace({ id: traceId, project_id: pid, user_id: "u2" }),
      ]);
      // No events data — legacy path reads traces table directly
      await createScoresCh([
        createTraceScore({
          id: v4(),
          project_id: pid,
          trace_id: traceId,
          name: scoreName,
          value: 1,
          source: "API",
        }),
      ]);

      const res = await makeZodVerifiedAPICall(
        GetScoresResponseV1,
        "GET",
        `/api/public/scores?name=${scoreName}`,
        undefined,
        auth,
      );
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].trace).toMatchObject({ userId: "u2" });
    });
  });
});
