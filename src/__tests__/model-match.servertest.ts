/** @jest-environment node */

import { modelMatch } from "@/scripts/model-match";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { findModel } from "@/src/server/api/services/EventProcessor";
import { prisma } from "@/src/server/db";

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
        unit: "TOKENS",
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
        unit: "TOKENS",
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
          unit: "TOKENS",
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
          unit: "TOKENS",
          input: "I am a prompt",
          output: "I am a completion",
        },
        {
          type: "GENERATION",
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          model: "claude-1.3",
          startTime: new Date("2024-01-01T00:00:00.000Z"),
          unit: "TOKENS",
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

    expect(observations.length).toEqual(3);
    observations.forEach((observation) => {
      expect(observation.internalModel).toBeDefined();
      expect(observation.promptTokens).toBeGreaterThan(0);
      expect(observation.completionTokens).toBeGreaterThan(0);
    });
  });

  it("should prevent ReDos attacks by timing out on complex model matches", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "redos",
        inputPrice: "0.0000010",
        outputPrice: "0.0000020",
        totalPrice: "0.1",
        matchPattern: "(a+)+$", // problematic regex
        projectId: null,
        unit: "TOKENS",
      },
    });

    await findModel({
      event: {
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        model: "a".repeat(1e8) + "!", // very long string
      },
    });

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Error finding model"),
      expect.stringContaining("canceling statement due to statement timeout"),
    );
  });
});
