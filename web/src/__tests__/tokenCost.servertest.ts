import { nanoid } from "ai";
import Decimal from "decimal.js";
import { v4 as uuidv4 } from "uuid";

import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { ModelUsageUnit } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { ObservationProcessor } from "@langfuse/shared/src/server";

describe("Token Cost Calculation", () => {
  const modelName = "gpt-test-" + nanoid();
  const matchPattern = `(?i)^(${modelName})$`;
  const traceId = uuidv4();
  const generationId = uuidv4();
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  const tokenModelData = {
    id: uuidv4(),
    modelName,
    matchPattern,
    inputPrice: 0.01,
    outputPrice: 0.02,
    totalPrice: 0.03,
    unit: ModelUsageUnit.Tokens,
    tokenizerId: "openai",
    tokenizerConfig: {
      tokensPerName: 1,
      tokenizerModel: "gpt-4o",
      tokensPerMessage: 3,
    },
  };

  const imageModelData = {
    id: uuidv4(),
    modelName,
    matchPattern,
    inputPrice: 1,
    outputPrice: 2,
    totalPrice: 3,
    unit: ModelUsageUnit.Images,
    tokenizerId: "openai",
    tokenizerConfig: {
      tokensPerName: 1,
      tokenizerModel: "gpt-4o",
      tokensPerMessage: 3,
    },
  };

  beforeEach(async () => {
    await pruneDatabase();
    await Promise.all([
      prisma.model.create({
        data: tokenModelData,
      }),
      prisma.model.create({
        data: imageModelData,
      }),
      prisma.trace.create({
        data: {
          id: traceId,
          projectId,
        },
      }),
    ]);
  });

  it("should correctly calculate token costs with provided model prices", async () => {
    const model = {
      inputPrice: new Decimal(0.01),
      outputPrice: new Decimal(0.02),
      totalPrice: new Decimal(0.03),
    };

    const tokenCounts = {
      input: 100,
      output: 200,
      total: 300,
    };

    const userProvidedCosts = {
      inputCost: null,
      outputCost: null,
      totalCost: null,
    };

    const costs = ObservationProcessor.calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts,
    );

    expect(costs.inputCost?.toNumber()).toBe(1.0); // 100 tokens * 0.01
    expect(costs.outputCost?.toNumber()).toBe(4.0); // 200 tokens * 0.02
    expect(costs.totalCost?.toNumber()).toBe(9.0); // 300 tokens * 0.03
  });

  it("should correctly calculate token costs with user provided costs", async () => {
    const model = {
      inputPrice: new Decimal(0.01),
      outputPrice: new Decimal(0.02),
      totalPrice: new Decimal(0.03),
    };

    const tokenCounts = {
      input: 100,
      output: 200,
      total: 300,
    };

    const userProvidedCosts = {
      inputCost: new Decimal(2.0),
      outputCost: new Decimal(3.0),
      totalCost: new Decimal(5.0),
    };

    const costs = ObservationProcessor.calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts,
    );

    expect(costs.inputCost?.toNumber()).toBe(2.0); // Overridden by user provided cost
    expect(costs.outputCost?.toNumber()).toBe(3.0); // Overridden by user provided cost
    expect(costs.totalCost?.toNumber()).toBe(5.0); // Overridden by user provided cost
  });

  it("should correctly calculate token costs when only some user provided costs are given", async () => {
    const model = {
      inputPrice: new Decimal(1),
      outputPrice: new Decimal(1),
    };

    const data = [
      // missing total
      {
        userProvidedCosts: {
          input: 1,
          output: 2,
          total: undefined,
        },
        expectedCost: {
          input: 1,
          output: 2,
          total: 3,
        },
      },
      // only total
      {
        userProvidedCosts: {
          input: undefined,
          output: undefined,
          total: 2,
        },
        expectedCost: {
          input: undefined,
          output: undefined,
          total: 2,
        },
      },
      // missing input
      {
        userProvidedCosts: {
          input: undefined,
          output: 2,
          total: 2,
        },
        expectedCost: {
          input: undefined,
          output: 2,
          total: 2,
        },
      },
      // only input
      {
        userProvidedCosts: {
          input: 1,
          output: undefined,
          total: undefined,
        },
        expectedCost: {
          input: 1,
          output: undefined,
          total: 1,
        },
      },

      // missing output
      {
        userProvidedCosts: {
          input: 1,
          output: undefined,
          total: 1,
        },
        expectedCost: {
          input: 1,
          output: undefined,
          total: 1,
        },
      },

      // only output
      {
        userProvidedCosts: {
          input: undefined,
          output: 2,
          total: undefined,
        },
        expectedCost: {
          input: undefined,
          output: 2,
          total: 2,
        },
      },
    ];

    for (const { userProvidedCosts, expectedCost } of data) {
      const tokenCounts = {
        input: 0,
        output: 0,
        total: 0,
      };

      const userProvidedCostsDecimal = {
        inputCost:
          userProvidedCosts.input && new Decimal(userProvidedCosts.input),
        outputCost:
          userProvidedCosts.output && new Decimal(userProvidedCosts.output),
        totalCost:
          userProvidedCosts.total && new Decimal(userProvidedCosts.total),
      };

      const costs = ObservationProcessor.calculateTokenCosts(
        model as any,
        userProvidedCostsDecimal as any,
        tokenCounts,
      );

      expect(costs.inputCost?.toNumber()).toBe(expectedCost.input);
      expect(costs.outputCost?.toNumber()).toBe(expectedCost.output);
      expect(costs.totalCost?.toNumber()).toBe(expectedCost.total);
    }
  });

  it("should return empty costs if no model is provided", async () => {
    const tokenCounts = {
      input: 100,
      output: 200,
      total: 300,
    };

    const userProvidedCosts = {
      inputCost: null,
      outputCost: null,
      totalCost: null,
    };

    const costs = ObservationProcessor.calculateTokenCosts(
      null,
      userProvidedCosts,
      tokenCounts,
    );

    expect(costs.inputCost?.toNumber()).toBeUndefined();
    expect(costs.outputCost?.toNumber()).toBeUndefined();
    expect(costs.totalCost?.toNumber()).toBeUndefined();
  });

  it("should handle zero token counts correctly", async () => {
    const model = {
      inputPrice: new Decimal(0.01),
      outputPrice: new Decimal(0.02),
      totalPrice: new Decimal(0.03),
    };

    const tokenCounts = {
      input: 0,
      output: 0,
      total: 0,
    };

    const userProvidedCosts = {
      inputCost: null,
      outputCost: null,
      totalCost: null,
    };

    const costs = ObservationProcessor.calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts,
    );

    expect(costs.inputCost?.toNumber()).toBe(0); // 0 tokens * 0.01
    expect(costs.outputCost?.toNumber()).toBe(0); // 0 tokens * 0.02
    expect(costs.totalCost?.toNumber()).toBe(0); // 0 tokens * 0.03
  });

  it("should handle missing token counts correctly", async () => {
    const model = {
      inputPrice: new Decimal(0.01),
      outputPrice: new Decimal(0.02),
      totalPrice: new Decimal(0.03),
    };

    const tokenCounts = {
      input: undefined,
      output: undefined,
      total: undefined,
    };

    const userProvidedCosts = {
      inputCost: null,
      outputCost: null,
      totalCost: null,
    };

    const costs = ObservationProcessor.calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts,
    );

    expect(costs.inputCost?.toNumber()).toBeUndefined();
    expect(costs.outputCost?.toNumber()).toBeUndefined();
    expect(costs.totalCost?.toNumber()).toBeUndefined();
  });

  it("should handle fractional token counts correctly", async () => {
    const model = {
      inputPrice: new Decimal(0.01),
      outputPrice: new Decimal(0.02),
      totalPrice: new Decimal(0.03),
    };

    const tokenCounts = {
      input: 150.5,
      output: 250.25,
      total: 400.75,
    };

    const userProvidedCosts = {
      inputCost: null,
      outputCost: null,
      totalCost: null,
    };

    const costs = ObservationProcessor.calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts,
    );

    expect(costs.inputCost?.toNumber()).toBeCloseTo(1.505); // 150.5 tokens * 0.01
    expect(costs.outputCost?.toNumber()).toBeCloseTo(5.005); // 250.25 tokens * 0.02
    expect(costs.totalCost?.toNumber()).toBeCloseTo(12.0225); // 400.75 tokens * 0.03
  });

  it("should handle large token counts correctly", async () => {
    const model = {
      inputPrice: new Decimal(0.01),
      outputPrice: new Decimal(0.02),
      totalPrice: new Decimal(0.03),
    };

    const tokenCounts = {
      input: 1e6,
      output: 2e6,
      total: 3e6,
    };

    const userProvidedCosts = {
      inputCost: null,
      outputCost: null,
      totalCost: null,
    };

    const costs = ObservationProcessor.calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts,
    );

    expect(costs.inputCost?.toNumber()).toBe(10000); // 1e6 tokens * 0.01
    expect(costs.outputCost?.toNumber()).toBe(40000); // 2e6 tokens * 0.02
    expect(costs.totalCost?.toNumber()).toBe(90000); // 3e6 tokens * 0.03
  });

  it("should correctly match model prices from the database", async () => {
    const generationUsage = {
      model: modelName,
      usage: {
        input: 100,
        output: 200,
        total: 300,
        unit: ModelUsageUnit.Tokens,
      },
    };
    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation?.internalModel).toBe(tokenModelData.modelName);
    expect(generation?.unit).toEqual(tokenModelData.unit);
    expect(generation?.internalModelId).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation?.inputCost).toBeNull();
    expect(generation?.outputCost).toBeNull();
    expect(generation?.totalCost).toBeNull();

    // Calculated cost
    expect(generation?.calculatedInputCost?.toNumber()).toBe(
      generationUsage.usage.input * tokenModelData.inputPrice,
    );
    expect(generation?.calculatedOutputCost?.toNumber()).toBe(
      generationUsage.usage.output * tokenModelData.outputPrice,
    );
    expect(generation?.calculatedTotalCost?.toNumber()).toBe(
      generationUsage.usage.total * tokenModelData.totalPrice,
    );
    expect(generation?.promptTokens).toBe(generationUsage.usage.input);
    expect(generation?.completionTokens).toBe(generationUsage.usage.output);
    expect(generation?.totalTokens).toBe(generationUsage.usage.total);
  });

  it("should overwrite costs for a generation without previous user provided costs", async () => {
    const generationUsage1 = {
      model: modelName,
      usage: {
        input: 1,
        output: 2,
        total: 3,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const generationUsage2 = {
      model: modelName,
      usage: {
        input: 100,
        output: 200,
        total: 300,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage2,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation?.internalModel).toBe(tokenModelData.modelName);
    expect(generation?.unit).toEqual(tokenModelData.unit);
    expect(generation?.internalModelId).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation?.inputCost).toBeNull();
    expect(generation?.outputCost).toBeNull();
    expect(generation?.totalCost).toBeNull();

    // Calculated cost
    expect(generation?.calculatedInputCost?.toNumber()).toBe(
      generationUsage2.usage.input * tokenModelData.inputPrice,
    );
    expect(generation?.calculatedOutputCost?.toNumber()).toBe(
      generationUsage2.usage.output * tokenModelData.outputPrice,
    );
    expect(generation?.calculatedTotalCost?.toNumber()).toBe(
      generationUsage2.usage.total * tokenModelData.totalPrice,
    );
    expect(generation?.promptTokens).toBe(generationUsage2.usage.input);
    expect(generation?.completionTokens).toBe(generationUsage2.usage.output);
    expect(generation?.totalTokens).toBe(generationUsage2.usage.total);
  });

  it("should correctly handle first manual tokenization and then provided tokens", async () => {
    const generationUsage1 = {
      model: modelName,
      input: "hello world",
      output: "",
      usage: null,
    };

    const generationUsage2 = {
      output: "whassup",
      usage: {
        input: 100,
        output: 200,
        total: 300,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage2,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation?.internalModel).toBe(tokenModelData.modelName);
    expect(generation?.unit).toEqual(tokenModelData.unit);
    expect(generation?.internalModelId).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation?.inputCost).toBeNull();
    expect(generation?.outputCost).toBeNull();
    expect(generation?.totalCost).toBeNull();

    // Calculated cost
    expect(generation?.calculatedInputCost?.toNumber()).toBe(
      generationUsage2.usage.input * tokenModelData.inputPrice,
    );
    expect(generation?.calculatedOutputCost?.toNumber()).toBe(
      generationUsage2.usage.output * tokenModelData.outputPrice,
    );
    expect(generation?.calculatedTotalCost?.toNumber()).toBe(
      generationUsage2.usage.total * tokenModelData.totalPrice,
    );
    expect(generation?.promptTokens).toBe(generationUsage2.usage.input);
    expect(generation?.completionTokens).toBe(generationUsage2.usage.output);
    expect(generation?.totalTokens).toBe(generationUsage2.usage.total);
  });

  it("should use the matched model of the previous generation call to calculate costs", async () => {
    const generationUsage1 = {
      model: modelName,
      usage: {
        input: 1,
        output: 2,
        total: 3,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const generationUsage2 = {
      model: undefined, // No model provided
      usage: {
        input: 100,
        output: 200,
        total: 300,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage2,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation?.internalModel).toBe(tokenModelData.modelName);
    expect(generation?.unit).toEqual(tokenModelData.unit);
    expect(generation?.internalModelId).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation?.inputCost).toBeNull();
    expect(generation?.outputCost).toBeNull();
    expect(generation?.totalCost).toBeNull();

    // Calculated cost
    expect(generation?.calculatedInputCost?.toNumber()).toBe(
      generationUsage2.usage.input * tokenModelData.inputPrice,
    );
    expect(generation?.calculatedOutputCost?.toNumber()).toBe(
      generationUsage2.usage.output * tokenModelData.outputPrice,
    );
    expect(generation?.calculatedTotalCost?.toNumber()).toBe(
      generationUsage2.usage.total * tokenModelData.totalPrice,
    );
    expect(generation?.promptTokens).toBe(generationUsage2.usage.input);
    expect(generation?.completionTokens).toBe(generationUsage2.usage.output);
    expect(generation?.totalTokens).toBe(generationUsage2.usage.total);
  });

  it("should discard model if following event has different unit", async () => {
    const generationUsage1 = {
      model: modelName,
    };

    const generationUsage2 = {
      model: modelName,
      usage: {
        totalCost: 10,
        unit: ModelUsageUnit.Characters, // Different unit for which model is not matched
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage2,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation?.internalModel).toBe(tokenModelData.modelName);
    expect(generation?.unit).toEqual(ModelUsageUnit.Characters);

    // No user provided cost
    expect(generation?.inputCost).toBeNull();
    expect(generation?.outputCost).toBeNull();
    expect(generation?.totalCost?.toNumber()).toBe(10);

    // Calculated cost
    expect(generation?.calculatedInputCost).toBeNull();
    expect(generation?.calculatedOutputCost).toBeNull();
    expect(generation?.calculatedTotalCost?.toNumber()).toBe(10);
  });

  it("should overwrite costs if new costs are user provided", async () => {
    const generationUsage1 = {
      model: modelName,
      usage: {
        input: 1,
        output: 2,
        total: 3,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const generationUsage2 = {
      model: modelName,
      usage: {
        input: 100,
        output: 200,
        total: 300,
        inputCost: 1234,
        outputCost: 23523,
        totalCost: 5354,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage2,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation?.internalModel).toBe(tokenModelData.modelName);
    expect(generation?.unit).toEqual(tokenModelData.unit);
    expect(generation?.internalModelId).toBe(tokenModelData.id);

    // User provided cost
    expect(generation?.inputCost?.toNumber()).toBe(
      generationUsage2.usage.inputCost,
    );
    expect(generation?.outputCost?.toNumber()).toBe(
      generationUsage2.usage.outputCost,
    );
    expect(generation?.totalCost?.toNumber()).toBe(
      generationUsage2.usage.totalCost,
    );

    // Calculated cost
    expect(generation?.calculatedInputCost?.toNumber()).toBe(
      generationUsage2.usage.inputCost,
    );
    expect(generation?.calculatedOutputCost?.toNumber()).toBe(
      generationUsage2.usage.outputCost,
    );
    expect(generation?.calculatedTotalCost?.toNumber()).toBe(
      generationUsage2.usage.totalCost,
    );
    expect(generation?.promptTokens).toBe(generationUsage2.usage.input);
    expect(generation?.completionTokens).toBe(generationUsage2.usage.output);
    expect(generation?.totalTokens).toBe(generationUsage2.usage.total);
  });

  it("should overwrite costs if new costs are user provided and zero", async () => {
    const generationUsage1 = {
      model: modelName,
      usage: {
        input: 1,
        output: 2,
        total: 3,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const generationUsage2 = {
      model: modelName,
      usage: {
        input: 100,
        output: 200,
        total: 300,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage2,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation?.internalModel).toBe(tokenModelData.modelName);
    expect(generation?.unit).toEqual(tokenModelData.unit);
    expect(generation?.internalModelId).toBe(tokenModelData.id);

    // User provided cost
    expect(generation?.inputCost?.toNumber()).toBe(
      generationUsage2.usage.inputCost,
    );
    expect(generation?.outputCost?.toNumber()).toBe(
      generationUsage2.usage.outputCost,
    );
    expect(generation?.totalCost?.toNumber()).toBe(
      generationUsage2.usage.totalCost,
    );

    // Calculated cost
    expect(generation?.calculatedInputCost?.toNumber()).toBe(
      generationUsage2.usage.inputCost,
    );
    expect(generation?.calculatedOutputCost?.toNumber()).toBe(
      generationUsage2.usage.outputCost,
    );
    expect(generation?.calculatedTotalCost?.toNumber()).toBe(
      generationUsage2.usage.totalCost,
    );
    expect(generation?.promptTokens).toBe(generationUsage2.usage.input);
    expect(generation?.completionTokens).toBe(generationUsage2.usage.output);
    expect(generation?.totalTokens).toBe(generationUsage2.usage.total);
  });

  it("should overwrite costs if new costs are user provided and only partial", async () => {
    const generationUsage1 = {
      model: modelName,
      usage: {
        input: 1,
        output: 2,
        total: 3,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const generationUsage2 = {
      model: modelName,
      usage: {
        outputCost: 1,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage2,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation?.internalModel).toBe(tokenModelData.modelName);
    expect(generation?.unit).toEqual(tokenModelData.unit);
    expect(generation?.internalModelId).toBe(tokenModelData.id);

    // User provided cost
    expect(generation?.inputCost?.toNumber()).toBe(undefined);
    expect(generation?.outputCost?.toNumber()).toBe(
      generationUsage2.usage.outputCost,
    );
    expect(generation?.totalCost?.toNumber()).toBe(undefined);

    // Calculated cost
    expect(generation?.calculatedInputCost?.toNumber()).toBe(undefined);
    expect(generation?.calculatedOutputCost?.toNumber()).toBe(
      generationUsage2.usage.outputCost,
    );
    expect(generation?.calculatedTotalCost?.toNumber()).toBe(1);
    expect(generation?.promptTokens).toBe(generationUsage1.usage.input);
    expect(generation?.completionTokens).toBe(generationUsage1.usage.output);
    expect(generation?.totalTokens).toBe(generationUsage1.usage.total);
  });

  it("should not overwrite costs if previous cost were user provided", async () => {
    const generationUsage1 = {
      model: modelName,
      usage: {
        input: 1,
        output: 2,
        total: 3,
        inputCost: 1234,
        outputCost: 23523,
        totalCost: 5354,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const generationUsage2 = {
      model: modelName,
      usage: {
        input: 100,
        output: 200,
        total: 300,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage2,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation?.internalModel).toBe(tokenModelData.modelName);
    expect(generation?.unit).toEqual(tokenModelData.unit);
    expect(generation?.internalModelId).toBe(tokenModelData.id);

    // User provided cost
    expect(generation?.inputCost?.toNumber()).toBe(
      generationUsage1.usage.inputCost,
    );
    expect(generation?.outputCost?.toNumber()).toBe(
      generationUsage1.usage.outputCost,
    );
    expect(generation?.totalCost?.toNumber()).toBe(
      generationUsage1.usage.totalCost,
    );

    // Calculated cost
    expect(generation?.calculatedInputCost?.toNumber()).toBe(
      generationUsage1.usage.inputCost,
    );
    expect(generation?.calculatedOutputCost?.toNumber()).toBe(
      generationUsage1.usage.outputCost,
    );
    expect(generation?.calculatedTotalCost?.toNumber()).toBe(
      generationUsage1.usage.totalCost,
    );
    expect(generation?.promptTokens).toBe(generationUsage2.usage.input);
    expect(generation?.completionTokens).toBe(generationUsage2.usage.output);
    expect(generation?.totalTokens).toBe(generationUsage2.usage.total);
  });

  it("should not calculate anything if no costs are provided and no model is matched", async () => {
    const generationUsage1 = {
      model: undefined, // No model provided
      usage: {
        input: 1,
        output: 2,
        total: 3,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const generationUsage2 = {
      model: undefined, // No model provided
      usage: {
        input: 100,
        output: 200,
        total: 300,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage2,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should not be matched
    expect(generation?.internalModel).toBeNull();
    expect(generation?.unit).toEqual(tokenModelData.unit);
    expect(generation?.internalModelId).toBeNull();

    // No user provided cost
    expect(generation?.inputCost).toBeNull();
    expect(generation?.outputCost).toBeNull();
    expect(generation?.totalCost).toBeNull();

    // No calculated cost
    expect(generation?.calculatedInputCost).toBeNull();
    expect(generation?.calculatedOutputCost).toBeNull();
    expect(generation?.calculatedTotalCost).toBeNull();

    expect(generation?.promptTokens).toBe(generationUsage2.usage.input);
    expect(generation?.completionTokens).toBe(generationUsage2.usage.output);
    expect(generation?.totalTokens).toBe(generationUsage2.usage.total);
  });

  it("should handle different model usage units correctly", async () => {
    const generationUsage1 = {
      model: modelName,
      usage: {
        input: 1,
        output: 2,
        total: 3,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const generationUsage2 = {
      model: modelName,
      usage: {
        input: 100,
        output: 200,
        total: 300,
        unit: ModelUsageUnit.Images, // Different unit
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage2,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation?.internalModel).toBe(imageModelData.modelName);
    expect(generation?.unit).toEqual(imageModelData.unit);
    expect(generation?.internalModelId).toBe(imageModelData.id);

    // No user provided cost
    expect(generation?.inputCost).toBeNull();
    expect(generation?.outputCost).toBeNull();
    expect(generation?.totalCost).toBeNull();

    // Calculated cost
    expect(generation?.calculatedInputCost?.toNumber()).toBe(
      generationUsage2.usage.input * imageModelData.inputPrice,
    );
    expect(generation?.calculatedOutputCost?.toNumber()).toBe(
      generationUsage2.usage.output * imageModelData.outputPrice,
    );
    expect(generation?.calculatedTotalCost?.toNumber()).toBe(
      generationUsage2.usage.total * imageModelData.totalPrice,
    );
    expect(generation?.promptTokens).toBe(generationUsage2.usage.input);
    expect(generation?.completionTokens).toBe(generationUsage2.usage.output);
    expect(generation?.totalTokens).toBe(generationUsage2.usage.total);
  });

  it("should take the latest user provided model for matching", async () => {
    // Create a new model with the same name but different prices
    const newModelData = {
      id: uuidv4(),
      modelName,
      matchPattern,
      startDate: new Date().toISOString(),
      inputPrice: tokenModelData.inputPrice * 2,
      outputPrice: tokenModelData.outputPrice * 2,
      totalPrice: tokenModelData.totalPrice * 2,
      unit: ModelUsageUnit.Tokens,
    };

    await prisma.model.create({
      data: newModelData,
    });

    const generationUsage = {
      model: modelName,
      usage: {
        input: 100,
        output: 200,
        total: 300,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation?.internalModel).toBe(newModelData.modelName);
    expect(generation?.unit).toEqual(newModelData.unit);
    expect(generation?.internalModelId).toBe(newModelData.id);

    // No user provided cost
    expect(generation?.inputCost).toBeNull();
    expect(generation?.outputCost).toBeNull();
    expect(generation?.totalCost).toBeNull();

    // Calculated cost
    expect(generation?.calculatedInputCost?.toNumber()).toBe(
      generationUsage.usage.input * newModelData.inputPrice,
    );
    expect(generation?.calculatedOutputCost?.toNumber()).toBe(
      generationUsage.usage.output * newModelData.outputPrice,
    );
    expect(generation?.calculatedTotalCost?.toNumber()).toBe(
      generationUsage.usage.total * newModelData.totalPrice,
    );
    expect(generation?.promptTokens).toBe(generationUsage.usage.input);
    expect(generation?.completionTokens).toBe(generationUsage.usage.output);
    expect(generation?.totalTokens).toBe(generationUsage.usage.total);
  });

  it("should use the tokens of the previous call without model if model comes with following call", async () => {
    const generationUsage1 = {
      model: undefined, // No model provided
      usage: {
        input: 1,
        output: 2,
        total: 3,
        unit: ModelUsageUnit.Tokens,
      },
    };

    const generationUsage2 = {
      model: modelName,
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage2,
        },
      },
    ];

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: events,
    });

    expect(response.status).toBe(207);
    const generation = await prisma.observation.findFirst({
      where: {
        id: generationId,
      },
    });

    expect(generation).toBeDefined();
    expect(generation?.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation?.internalModel).toBe(tokenModelData.modelName);
    expect(generation?.unit).toEqual(tokenModelData.unit);
    expect(generation?.internalModelId).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation?.inputCost).toBeNull();
    expect(generation?.outputCost).toBeNull();
    expect(generation?.totalCost).toBeNull();

    // Calculated cost
    expect(generation?.calculatedInputCost?.toNumber()).toBe(
      generationUsage1.usage.input * tokenModelData.inputPrice,
    );
    expect(generation?.calculatedOutputCost?.toNumber()).toBe(
      generationUsage1.usage.output * tokenModelData.outputPrice,
    );
    expect(generation?.calculatedTotalCost?.toNumber()).toBe(
      generationUsage1.usage.total * tokenModelData.totalPrice,
    );
    expect(generation?.promptTokens).toBe(generationUsage1.usage.input);
    expect(generation?.completionTokens).toBe(generationUsage1.usage.output);
    expect(generation?.totalTokens).toBe(generationUsage1.usage.total);
  });
});
