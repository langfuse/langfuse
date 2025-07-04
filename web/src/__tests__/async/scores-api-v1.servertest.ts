import {
  createObservation,
  createTraceScore,
  createTrace,
  createSessionScore,
  getScoresByIds,
} from "@langfuse/shared/src/server";
import {
  createObservationsCh,
  createScoresCh,
  createTracesCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import {
  DeleteScoreResponseV1,
  GetScoreResponseV1,
  GetScoresResponseV1,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";
import { z } from "zod/v4";
import waitForExpect from "wait-for-expect";

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

    it("should post score with score config if in valid range", async () => {
      const configId = v4();
      const traceId = v4();
      const scoreId = v4();

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
      const scoreId_1 = v4();
      const scoreId_2 = v4();
      const scoreId_3 = v4();
      const scoreId_4 = v4();
      const scoreId_5 = v4();
      const scoreId_6 = v4();
      const scoreId_7 = v4();
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
          totalItems: 5, // 7 scores in total, but only 5 are trace scores
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
          expect(val).toMatchObject({
            traceId: traceId,
            trace: { tags: ["prod", "test"], userId: "user-name" },
          });
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
          totalItems: 1,
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
    });
  });
});
