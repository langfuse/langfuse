/** @jest-environment node */

import { pruneDatabase } from "@/src/__tests__/test-utils";
import { ModelUsageUnit } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

describe("cost retrieval tests", () => {
  beforeEach(async () => await pruneDatabase());

  [
    {
      testDescription: "prompt and completion tokens",
      promptTokens: 200,
      completionTokens: 3000,
      totalTokens: undefined,
      inputPrice: "0.0000010",
      outputPrice: "0.0000020",
      totalPrice: undefined,
      expectedPromptTokens: 200,
      expectedCompletionTokens: 3000,
      expectedTotalTokens: 0,
      expectedInputCost: "0.0002", // 200 / 1000 * 0.0010
      expectedOutputCost: "0.006", // 3000 / 1000 * 0.0020
      expectedTotalCost: "0.0062", // 0.0002 + 0.006
    },
    {
      testDescription: "missing completion tokens",
      promptTokens: 200,
      completionTokens: undefined,
      totalTokens: undefined,
      inputPrice: "0.0000010",
      outputPrice: "0.0000020",
      totalPrice: undefined,
      expectedPromptTokens: 200,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 0,
      expectedInputCost: "0.0002",
      expectedOutputCost: "0", // completionTokens are set to 0 when ingesting undefined, hence 0 cost
      expectedTotalCost: "0.0002",
    },
    {
      testDescription: "missing prompt tokens",
      promptTokens: undefined,
      completionTokens: 3000,
      totalTokens: undefined,
      inputPrice: "0.0000010",
      outputPrice: "0.0000020",
      totalPrice: undefined,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 3000,
      expectedTotalTokens: 0,
      expectedInputCost: "0", // promptTokens are set to 0 when ingesting undefined, hence 0 cost
      expectedOutputCost: "0.006",
      expectedTotalCost: "0.006",
    },
    {
      testDescription: "prompt and completion and total",
      promptTokens: 200,
      completionTokens: 3000,
      totalTokens: 3200,
      inputPrice: "0.0000010",
      outputPrice: "0.0000020",
      totalPrice: undefined,
      expectedPromptTokens: 200,
      expectedCompletionTokens: 3000,
      expectedTotalTokens: 3200,
      expectedInputCost: "0.0002", // 200 / 1000 * 0.0010
      expectedOutputCost: "0.006", // 3000 / 1000 * 0.0020
      expectedTotalCost: "0.0062", // 0.0002 + 0.006
    },
    {
      testDescription: "total only without price",
      promptTokens: undefined,
      completionTokens: undefined,
      totalTokens: 3200,
      inputPrice: "0.0000010",
      outputPrice: "0.0000020",
      totalPrice: undefined,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 3200,
      expectedInputCost: "0",
      expectedOutputCost: "0",
      expectedTotalCost: "0",
    },
    {
      testDescription: "total only",
      promptTokens: undefined,
      completionTokens: undefined,
      totalTokens: 3200,
      inputPrice: "0.0000010",
      outputPrice: "0.0000020",
      totalPrice: "0.1",
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 3200,
      expectedInputCost: "0",
      expectedOutputCost: "0",
      expectedTotalCost: "320",
    },
  ].forEach((input) => {
    it(`should calculate cost correctly ${input.testDescription}`, async () => {
      await pruneDatabase();

      await prisma.model.create({
        data: {
          modelName: "gpt-3.5-turbo",
          inputPrice: input.inputPrice,
          outputPrice: input.outputPrice,
          totalPrice: input.totalPrice,
          matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
          projectId: null,
          startDate: new Date("2023-12-01"),
          tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
          unit: ModelUsageUnit.Tokens,
        },
      });

      const dbTrace = await prisma.trace.create({
        data: {
          name: "trace-name",
          project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        },
      });

      await prisma.observation.create({
        data: {
          traceId: dbTrace.id,
          type: "GENERATION",
          project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
          model: "gpt-3.5-turbo",
          internalModel: "gpt-3.5-turbo",
          startTime: new Date("2024-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          totalTokens: input.totalTokens,
        },
      });

      const view = await prisma.observationView.findFirst({
        where: { traceId: dbTrace.id },
      });

      expect(view?.promptTokens).toBe(input.expectedPromptTokens);
      expect(view?.completionTokens).toBe(input.expectedCompletionTokens);
      expect(view?.totalTokens).toBe(input.expectedTotalTokens);

      // calculated cost fields
      expect(view?.calculatedInputCost?.toString()).toBe(
        input.expectedInputCost,
      );
      expect(view?.calculatedOutputCost?.toString()).toBe(
        input.expectedOutputCost,
      );
      expect(view?.calculatedTotalCost?.toString()).toBe(
        input.expectedTotalCost,
      );
    });
  });

  [
    {
      testDescription: "overwriting project specific model",
      expectedInputCost: "0.0004", // 200 / 1000 * 0.0010
      expectedOutputCost: "0.012", // 3000 / 1000 * 0.0020
      expectedTotalCost: "0.0124", // 0.0002 + 0.006
      expectedModelId: "model-2",
    },
  ].forEach((input) => {
    it(`should calculate cost correctly with multiple models ${input.testDescription}`, async () => {
      await pruneDatabase();

      await prisma.model.create({
        data: {
          id: "model-1",
          modelName: "gpt-3.5-turbo",
          inputPrice: "0.0000010",
          outputPrice: "0.0000020",
          totalPrice: "0.1",
          matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
          projectId: null,
          startDate: new Date("2023-12-01"),
          tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
          unit: ModelUsageUnit.Tokens,
        },
      });
      await prisma.model.create({
        data: {
          id: "model-2",
          modelName: "gpt-3.5-turbo",
          inputPrice: "0.0000020",
          outputPrice: "0.0000040",
          totalPrice: undefined,
          matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
          startDate: new Date("2023-12-01"),
          tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
          unit: ModelUsageUnit.Tokens,
          project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        },
      });

      const dbTrace = await prisma.trace.create({
        data: {
          name: "trace-name",
          project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        },
      });

      await prisma.observation.create({
        data: {
          traceId: dbTrace.id,
          type: "GENERATION",
          project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
          model: "gpt-3.5-turbo",
          internalModel: "gpt-3.5-turbo",
          startTime: new Date("2024-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          promptTokens: 200,
          completionTokens: 3000,
          totalTokens: undefined,
        },
      });

      const view = await prisma.observationView.findFirst({
        where: { traceId: dbTrace.id },
      });

      // calculated cost fields
      expect(view?.modelId).toBe(input.expectedModelId);
      expect(view?.calculatedInputCost?.toString()).toBe(
        input.expectedInputCost,
      );
      expect(view?.calculatedOutputCost?.toString()).toBe(
        input.expectedOutputCost,
      );
      expect(view?.calculatedTotalCost?.toString()).toBe(
        input.expectedTotalCost,
      );
    });
  });

  it(`should prioritize latest models`, async () => {
    await pruneDatabase();
    await prisma.model.create({
      data: {
        id: "model-0",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000000",
        outputPrice: "0.0000000",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        projectId: null,
        startDate: null,
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: ModelUsageUnit.Tokens,
      },
    });

    await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000010",
        outputPrice: "0.0000020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        projectId: null,
        startDate: new Date("2023-12-01"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: ModelUsageUnit.Tokens,
      },
    });
    await prisma.model.create({
      data: {
        id: "model-2",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000020",
        outputPrice: "0.0000040",
        totalPrice: undefined,
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: new Date("2023-12-02"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: ModelUsageUnit.Tokens,
      },
    });

    const dbTrace = await prisma.trace.create({
      data: {
        name: "trace-name",
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
      },
    });

    await prisma.observation.create({
      data: {
        traceId: dbTrace.id,
        type: "GENERATION",
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        model: "gpt-3.5-turbo",
        internalModel: "gpt-3.5-turbo",
        startTime: new Date("2024-01-01T00:00:00.000Z"),
        unit: ModelUsageUnit.Tokens,
        promptTokens: 200,
        completionTokens: 3000,
        totalTokens: undefined,
      },
    });

    const view = await prisma.observationView.findFirst({
      where: { traceId: dbTrace.id },
    });

    console.log(view);

    // calculated cost fields
    expect(view?.modelId).toBe("model-2");
    expect(view?.calculatedInputCost?.toString()).toBe("0.0004");
    expect(view?.calculatedOutputCost?.toString()).toBe("0.012");
    expect(view?.calculatedTotalCost?.toString()).toBe("0.0124");
  });

  it(`should take old model for old observations`, async () => {
    await prisma.model.create({
      data: {
        id: "model-0",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000000",
        outputPrice: "0.0000000",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        projectId: null,
        startDate: null,
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: ModelUsageUnit.Tokens,
      },
    });

    await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000010",
        outputPrice: "0.0000020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        projectId: null,
        startDate: new Date("2023-12-01"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: ModelUsageUnit.Tokens,
      },
    });
    await prisma.model.create({
      data: {
        id: "model-2",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000020",
        outputPrice: "0.0000040",
        totalPrice: undefined,
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: new Date("2023-12-02"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: ModelUsageUnit.Tokens,
      },
    });

    const dbTrace = await prisma.trace.create({
      data: {
        name: "trace-name",
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
      },
    });

    await prisma.observation.create({
      data: {
        traceId: dbTrace.id,
        type: "GENERATION",
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        model: "gpt-3.5-turbo",
        internalModel: "gpt-3.5-turbo",
        startTime: new Date("2023-01-01T00:00:00.000Z"),
        unit: ModelUsageUnit.Tokens,
        promptTokens: 200,
        completionTokens: 3000,
        totalTokens: undefined,
      },
    });

    const view = await prisma.observationView.findFirst({
      where: { traceId: dbTrace.id },
    });

    console.log(view);

    // calculated cost fields
    expect(view?.modelId).toBe("model-0");
    expect(view?.calculatedInputCost?.toString()).toBe("0");
    expect(view?.calculatedOutputCost?.toString()).toBe("0");
    expect(view?.calculatedTotalCost?.toString()).toBe("0");
  });

  it(`should prioritize own models`, async () => {
    await pruneDatabase();
    await prisma.model.create({
      data: {
        id: "model-0",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000000",
        outputPrice: "0.0000000",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        projectId: null,
        startDate: null,
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: ModelUsageUnit.Tokens,
      },
    });

    await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000010",
        outputPrice: "0.0000020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: null,
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: ModelUsageUnit.Tokens,
      },
    });

    const dbTrace = await prisma.trace.create({
      data: {
        name: "trace-name",
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
      },
    });

    await prisma.observation.create({
      data: {
        traceId: dbTrace.id,
        type: "GENERATION",
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        model: "gpt-3.5-turbo",
        internalModel: "gpt-3.5-turbo",
        startTime: new Date("2024-01-01T00:00:00.000Z"),
        unit: ModelUsageUnit.Tokens,
        promptTokens: 200,
        completionTokens: 3000,
        totalTokens: undefined,
      },
    });

    const view = await prisma.observationView.findFirst({
      where: { traceId: dbTrace.id },
    });

    console.log(view);

    // calculated cost fields
    expect(view?.modelId).toBe("model-1");
  });

  it(`should prioritize old model if the latest model is not own one`, async () => {
    await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0010",
        outputPrice: "0.0020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: new Date("2023-12-02"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: ModelUsageUnit.Tokens,
      },
    });
    await prisma.model.create({
      data: {
        id: "model-2",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000020",
        outputPrice: "0.0000040",
        totalPrice: undefined,
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: new Date("2023-12-01"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        unit: ModelUsageUnit.Tokens,
      },
    });

    const dbTrace = await prisma.trace.create({
      data: {
        name: "trace-name",
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
      },
    });

    await prisma.observation.create({
      data: {
        traceId: dbTrace.id,
        type: "GENERATION",
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        model: "gpt-3.5-turbo",
        internalModel: "gpt-3.5-turbo",
        startTime: new Date("2024-01-01T00:00:00.000Z"),
        unit: ModelUsageUnit.Tokens,
        promptTokens: 200,
        completionTokens: 3000,
        totalTokens: undefined,
      },
    });

    const view = await prisma.observationView.findFirst({
      where: { traceId: dbTrace.id },
    });

    console.log(view);

    // calculated cost fields
    expect(view?.modelId).toBe("model-2");
    expect(view?.calculatedInputCost?.toString()).toBe("0.0004");
    expect(view?.calculatedOutputCost?.toString()).toBe("0.012");
    expect(view?.calculatedTotalCost?.toString()).toBe("0.0124");
  });

  it(`should prioritize new model if the latest model is own one`, async () => {
    await pruneDatabase();

    await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0010",
        outputPrice: "0.0020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: null,
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: ModelUsageUnit.Tokens,
      },
    });
    await prisma.model.create({
      data: {
        id: "model-2",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000020",
        outputPrice: "0.0000040",
        totalPrice: undefined,
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: new Date("2023-12-01"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        unit: ModelUsageUnit.Tokens,
      },
    });

    const dbTrace = await prisma.trace.create({
      data: {
        name: "trace-name",
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
      },
    });

    await prisma.observation.create({
      data: {
        traceId: dbTrace.id,
        type: "GENERATION",
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        model: "gpt-3.5-turbo",
        internalModel: "gpt-3.5-turbo",
        startTime: new Date("2024-01-01T00:00:00.000Z"),
        unit: ModelUsageUnit.Tokens,
        promptTokens: 200,
        completionTokens: 3000,
        totalTokens: undefined,
      },
    });

    const view = await prisma.observationView.findFirst({
      where: { traceId: dbTrace.id },
    });

    console.log(view);

    // calculated cost fields
    expect(view?.modelId).toBe("model-2");
    expect(view?.calculatedInputCost?.toString()).toBe("0.0004");
    expect(view?.calculatedOutputCost?.toString()).toBe("0.012");
    expect(view?.calculatedTotalCost?.toString()).toBe("0.0124");
  });

  it(`should prioritize user provided cost`, async () => {
    await pruneDatabase();

    await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0010",
        outputPrice: "0.0020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: new Date("2023-12-02"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        unit: ModelUsageUnit.Tokens,
      },
    });
    await prisma.model.create({
      data: {
        id: "model-2",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0020",
        outputPrice: "0.0040",
        totalPrice: undefined,
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        startDate: new Date("2023-12-01"),
        tokenizerConfig: { tokensPerMessage: 3, tokensPerName: 1 },
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        unit: ModelUsageUnit.Tokens,
      },
    });

    const dbTrace = await prisma.trace.create({
      data: {
        name: "trace-name",
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
      },
    });

    await prisma.observation.create({
      data: {
        traceId: dbTrace.id,
        type: "GENERATION",
        project: { connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" } },
        model: "gpt-3.5-turbo",
        internalModel: "gpt-3.5-turbo",
        startTime: new Date("2024-01-01T00:00:00.000Z"),
        unit: ModelUsageUnit.Tokens,
        promptTokens: 200,
        completionTokens: 3000,
        totalTokens: undefined,
        inputCost: "1",
        outputCost: "2",
        totalCost: "3",
      },
    });

    const view = await prisma.observationView.findFirst({
      where: { traceId: dbTrace.id },
    });

    console.log(view);

    // calculated cost fields
    expect(view?.modelId).toBe("model-2");
    expect(view?.calculatedInputCost?.toString()).toBe("1");
    expect(view?.calculatedOutputCost?.toString()).toBe("2");
    expect(view?.calculatedTotalCost?.toString()).toBe("3");
  });
});
