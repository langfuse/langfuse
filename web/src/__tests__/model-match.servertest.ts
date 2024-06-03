/** @jest-environment node */

import { modelMatch } from "@/scripts/model-match";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { ModelUsageUnit } from "@langfuse/shared";

describe("model match", () => {
  beforeEach(async () => await pruneDatabase());

  it("should match historic observations to models", async () => {
    await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000010",
        outputPrice: "0.0000020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-3.5-turbo)?(.*)",
        projectId: null,
        unit: ModelUsageUnit.Tokens,
        tokenizerConfig: {
          tokensPerMessage: 3,
          tokensPerName: 1,
          tokenizerModel: "gpt-3.5-turbo",
        },
        tokenizerId: "openai",
      },
    });
    await prisma.model.create({
      data: {
        id: "model-2",
        modelName: "claude-1.3",
        inputPrice: "0.0000010",
        outputPrice: "0.0000020",
        totalPrice: "0.1",
        matchPattern: "(.*)(claude-1.3)?(.*)",
        projectId: null,
        unit: ModelUsageUnit.Tokens,
        tokenizerId: "claude",
      },
    });

    await prisma.observation.createMany({
      data: [
        {
          id: "observation-1",
          type: "GENERATION",
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          model: "gpt-3.5-turbo",
          startTime: new Date("2024-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          promptTokens: 200,
          completionTokens: 3000,
          input: "I am a prompt",
          output: "I am a completion",
        },
        {
          type: "GENERATION",
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          model: "claude-1.3",
          startTime: new Date("2024-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          input: "I am a prompt",
          output: "I am a completion",
        },
        {
          type: "GENERATION",
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          model: "claude-1.3",
          startTime: new Date("2024-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          input: "I am a prompt",
          output: "I am a completion",
        },
        {
          type: "GENERATION",
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          model: "gpt-4o",
          startTime: new Date("2024-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          input: "I am a prompt",
          output: "I am a completion",
        },
      ],
    });

    await modelMatch();

    const observations = await prisma.observation.findMany();

    // check that tokens from observation-1 are not changed
    const observation1 = observations.find((o) => o.id === "observation-1");
    expect(observation1?.promptTokens).toEqual(200);
    expect(observation1?.completionTokens).toEqual(3000);
    expect(observation1?.totalTokens).toEqual(0);

    expect(observations.length).toEqual(4);
    observations.forEach((observation) => {
      expect(observation.internalModel).toBeDefined();
      expect(observation.promptTokens).toBeGreaterThan(0);
      expect(observation.completionTokens).toBeGreaterThan(0);
    });

    // temporary fix: wait for 5 additional seconds to ensure that the model match is complete
    // had issue with the test failing because the model match was not complete and logged to console
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }, 10000);
});
