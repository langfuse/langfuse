import {
  createObservation,
  createTrace,
  createScoresCh,
  createTracesCh,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createTraceScore,
  createSessionScore,
} from "@langfuse/shared/src/server";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { GetScoreResponseV2, GetScoresResponseV2 } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";
import { z } from "zod";

describe("/api/public/v2/scores API Endpoint", () => {
  let authentication: string;
  let newProjectId: string;

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
      const scoreId_1 = v4();
      const scoreId_2 = v4();
      const scoreId_3 = v4();
      const scoreId_4 = v4();
      const scoreId_5 = v4();
      const scoreId_6 = v4();
      const scoreId_7 = v4();

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
          totalItems: 7,
          totalPages: 1,
        });
        for (const val of getAllScore.body.data) {
          if (val.traceId) {
            expect(val).toMatchObject({
              sessionId: null,
            });
          } else {
            expect(val).toMatchObject({
              sessionId: sessionId,
              trace: null,
            });
          }
        }
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
          totalItems: 5,
          totalPages: 1,
        });
        for (const val of getAllScore.body.data) {
          expect(val).toMatchObject({
            dataType: "NUMERIC",
          });
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
          expect(val).toMatchObject({
            traceId: traceId,
            trace: { tags: ["prod", "test"], userId: "user-name" },
          });
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
              `API call did not return 200, returned status 400, body {\"message\":\"Invalid request data\",\"error\":[{\"received\":\"op\",\"code\":\"invalid_enum_value\",\"options\":[\"<\",\">\",\"<=\",\">=\",\"!=\",\"=\"],\"path\":[\"operator\"],\"message\":\"Invalid enum value. Expected '<' | '>' | '<=' | '>=' | '!=' | '=', received 'op'\"}]}`,
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
              'API call did not return 200, returned status 400, body {"message":"Invalid request data","error":[{"code":"invalid_type","expected":"number","received":"nan","path":["value"],"message":"Expected number, received nan"}]}',
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
    });

    describe("should Filter scores by traceIds / observationIds / sessionIds", () => {
      let obsId_1: string;
      let obsId_2: string;
      let sessionId_1: string;
      let sessionId_2: string;
      let traceId_4: string;
      let traceId_5: string;
      let scoreId_8: string;
      let scoreId_9: string;
      let scoreId_10: string;
      let scoreId_11: string;
      let scoreId_12: string;
      let scoreId_13: string;

      beforeEach(async () => {
        // Create additional resources for ID filtering tests
        obsId_1 = v4();
        obsId_2 = v4();
        sessionId_1 = v4();
        sessionId_2 = v4();
        traceId_4 = v4();
        traceId_5 = v4();
        scoreId_8 = v4();
        scoreId_9 = v4();
        scoreId_10 = v4();
        scoreId_11 = v4();
        scoreId_12 = v4();
        scoreId_13 = v4();

        const observation_1 = createObservation({
          id: obsId_1,
          project_id: newProjectId,
          trace_id: traceId_4,
          type: "SPAN",
        });
        const observation_2 = createObservation({
          id: obsId_2,
          project_id: newProjectId,
          trace_id: traceId_5,
          type: "SPAN",
        });
        await createObservationsCh([observation_1, observation_2]);

        const trace_4 = createTrace({
          id: traceId_4,
          project_id: newProjectId,
          session_id: sessionId_1,
        });
        const trace_5 = createTrace({
          id: traceId_5,
          project_id: newProjectId,
          session_id: sessionId_2,
        });
        await createTracesCh([trace_4, trace_5]);

        // Score linked to trace 4, obs 1, session 1
        const score_8 = createTraceScore({
          id: scoreId_8,
          project_id: newProjectId,
          trace_id: traceId_4,
          observation_id: obsId_1,
          session_id: sessionId_1,
          name: "id-filter-score",
          value: 1,
        });

        // Score linked to trace 5, obs 2, session 2
        const score_9 = createTraceScore({
          id: scoreId_9,
          project_id: newProjectId,
          trace_id: traceId_5,
          observation_id: obsId_2,
          session_id: sessionId_2,
          name: "id-filter-score",
          value: 2,
        });

        // Score linked to trace 4, obs 2, session 1
        const score_10 = createTraceScore({
          id: scoreId_10,
          project_id: newProjectId,
          trace_id: traceId_4,
          observation_id: obsId_2, // Different observation
          session_id: sessionId_1,
          name: "id-filter-score",
          value: 3,
        });

        // Score linked to trace 5, obs 1, session 2
        const score_11 = createTraceScore({
          id: scoreId_11,
          project_id: newProjectId,
          trace_id: traceId_5,
          observation_id: obsId_1, // Different observation
          session_id: sessionId_2,
          name: "id-filter-score",
          value: 4,
        });

        // Standalone session score
        const score_12 = createSessionScore({
          id: scoreId_12,
          project_id: newProjectId,
          session_id: sessionId_1,
          name: "id-filter-score-session-only",
          value: 5,
        });

        // Another standalone session score
        const score_13 = createSessionScore({
          id: scoreId_13,
          project_id: newProjectId,
          session_id: sessionId_2,
          name: "id-filter-score-session-only",
          value: 6,
        });

        await createScoresCh([
          score_8,
          score_9,
          score_10,
          score_11,
          score_12,
          score_13,
        ]);
      });

      it("should filter by single traceId", async () => {
        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?traceIds=${traceId_4}`,
          undefined,
          authentication,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({ totalItems: 2 });
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: scoreId_8, traceId: traceId_4 }),
            expect.objectContaining({ id: scoreId_10, traceId: traceId_4 }),
          ]),
        );
        expect(getScore.body.data).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: scoreId_9 }), // Belongs to traceId_5
            expect.objectContaining({ id: scoreId_11 }), // Belongs to traceId_5
            expect.objectContaining({ id: scoreId_12 }), // No traceId
            expect.objectContaining({ id: scoreId_13 }), // No traceId
          ]),
        );
      });

      it("should filter by multiple traceIds", async () => {
        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?traceIds=${traceId_4},${traceId_5}`,
          undefined,
          authentication,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({ totalItems: 4 });
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: scoreId_8, traceId: traceId_4 }),
            expect.objectContaining({ id: scoreId_9, traceId: traceId_5 }),
            expect.objectContaining({ id: scoreId_10, traceId: traceId_4 }),
            expect.objectContaining({ id: scoreId_11, traceId: traceId_5 }),
          ]),
        );
        expect(getScore.body.data).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: scoreId_12 }), // No traceId
            expect.objectContaining({ id: scoreId_13 }), // No traceId
          ]),
        );
      });

      it("should filter by single observationId", async () => {
        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?observationIds=${obsId_1}`,
          undefined,
          authentication,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({ totalItems: 2 });
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: scoreId_8, observationId: obsId_1 }),
            expect.objectContaining({ id: scoreId_11, observationId: obsId_1 }),
          ]),
        );
        expect(getScore.body.data).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: scoreId_9 }), // Belongs to obsId_2
            expect.objectContaining({ id: scoreId_10 }), // Belongs to obsId_2
            expect.objectContaining({ id: scoreId_12 }), // No obsId
            expect.objectContaining({ id: scoreId_13 }), // No obsId
          ]),
        );
      });

      it("should filter by multiple observationIds", async () => {
        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?observationIds=${obsId_1},${obsId_2}`,
          undefined,
          authentication,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({ totalItems: 4 });
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: scoreId_8, observationId: obsId_1 }),
            expect.objectContaining({ id: scoreId_9, observationId: obsId_2 }),
            expect.objectContaining({ id: scoreId_10, observationId: obsId_2 }),
            expect.objectContaining({ id: scoreId_11, observationId: obsId_1 }),
          ]),
        );
        expect(getScore.body.data).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: scoreId_12 }), // No obsId
            expect.objectContaining({ id: scoreId_13 }), // No obsId
          ]),
        );
      });

      it("should filter by single sessionId", async () => {
        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?sessionIds=${sessionId_1}`,
          undefined,
          authentication,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({ totalItems: 3 }); // score_8, score_10, score_12
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: scoreId_8, sessionId: sessionId_1 }),
            expect.objectContaining({ id: scoreId_10, sessionId: sessionId_1 }),
            expect.objectContaining({ id: scoreId_12, sessionId: sessionId_1 }),
          ]),
        );
        expect(getScore.body.data).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: scoreId_9 }), // Belongs to sessionId_2
            expect.objectContaining({ id: scoreId_11 }), // Belongs to sessionId_2
            expect.objectContaining({ id: scoreId_13 }), // Belongs to sessionId_2
          ]),
        );
      });

      it("should filter by multiple sessionIds", async () => {
        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?sessionIds=${sessionId_1},${sessionId_2}`,
          undefined,
          authentication,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({ totalItems: 6 }); // All scores except those unrelated to session/trace
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: scoreId_8, sessionId: sessionId_1 }),
            expect.objectContaining({ id: scoreId_9, sessionId: sessionId_2 }),
            expect.objectContaining({ id: scoreId_10, sessionId: sessionId_1 }),
            expect.objectContaining({ id: scoreId_11, sessionId: sessionId_2 }),
            expect.objectContaining({ id: scoreId_12, sessionId: sessionId_1 }),
            expect.objectContaining({ id: scoreId_13, sessionId: sessionId_2 }),
          ]),
        );
      });

      it("should filter by combining traceId and observationId", async () => {
        const getScore = await makeZodVerifiedAPICall(
          GetScoresResponseV2,
          "GET",
          `/api/public/v2/scores?traceIds=${traceId_4}&observationIds=${obsId_1}`,
          undefined,
          authentication,
        );
        expect(getScore.status).toBe(200);
        expect(getScore.body.meta).toMatchObject({ totalItems: 1 }); // Only score_8 matches both
        expect(getScore.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: scoreId_8,
              traceId: traceId_4,
              observationId: obsId_1,
            }),
          ]),
        );
        expect(getScore.body.data).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: scoreId_9 }),
            expect.objectContaining({ id: scoreId_10 }),
            expect.objectContaining({ id: scoreId_11 }),
            expect.objectContaining({ id: scoreId_12 }),
            expect.objectContaining({ id: scoreId_13 }),
          ]),
        );
      });
    });
  });
});
