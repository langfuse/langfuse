/** @jest-environment node */

import { makeAPICall } from "@/src/__tests__/test-utils";
import { prisma } from "@/src/server/db";
import { v4 } from "uuid";

describe("/api/public/ingestion API Endpoint", () => {
  [
    {
      observationExternalModel: "gpt-3.5-turbo",
      observationStartTime: new Date("2024-01-01T00:00:00.000Z"),
      modelUnit: "TOKENS",
      expectedInternalModel: "gpt-3.5-turbo",
      expectedPromptTokens: 5,
      expectedCompletionTokens: 7,
    },
    {
      observationExternalModel: "text-embedding-ada-002",
      observationStartTime: new Date("2024-01-01T00:00:00.000Z"),
      modelUnit: "TOKENS",
      expectedInternalModel: "text-embedding-ada-002",
      expectedPromptTokens: 5,
      expectedCompletionTokens: 7,
    },
  ].forEach((testConfig) => {
    it(`should match observations to Langfuse managed internal models and calculate tokens ${JSON.stringify(
      testConfig,
    )}`, async () => {
      const traceId = v4();
      const generationId = v4();

      const response = await makeAPICall("POST", "/api/public/ingestion", {
        metadata: {
          sdk_verion: "1.0.0",
          sdk_name: "python",
        },
        batch: [
          {
            id: v4(),
            type: "trace-create",
            timestamp: new Date().toISOString(),
            body: {
              id: traceId,
              name: "trace-name",
            },
          },
          {
            id: v4(),
            type: "observation-create",
            timestamp: new Date().toISOString(),
            body: {
              id: generationId,
              traceId: traceId,
              type: "GENERATION",
              name: "generation-name",
              startTime: testConfig.observationStartTime.toISOString(),
              model: testConfig.observationExternalModel,
              usage: {
                unit: testConfig.modelUnit,
              },
              input: "This is a great prompt",
              output: "This is a great gpt output",
            },
          },
        ],
      });

      expect(response.status).toBe(207);

      const dbGeneration = await prisma.observation.findUnique({
        where: {
          id: generationId,
        },
      });

      expect(dbGeneration?.id).toBe(generationId);
      expect(dbGeneration?.traceId).toBe(traceId);
      expect(dbGeneration?.name).toBe("generation-name");
      expect(dbGeneration?.startTime).toEqual(testConfig.observationStartTime);
      expect(dbGeneration?.model).toBe(testConfig.observationExternalModel);
      expect(dbGeneration?.promptTokens).toBe(testConfig.expectedPromptTokens);
      expect(dbGeneration?.completionTokens).toBe(
        testConfig.expectedCompletionTokens,
      );
      expect(dbGeneration?.internalModel).toBe(
        testConfig.expectedInternalModel,
      );
    });
  });
});
