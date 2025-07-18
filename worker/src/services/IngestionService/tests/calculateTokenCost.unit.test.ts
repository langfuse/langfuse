import Decimal from "decimal.js";
import { v4 as uuidv4 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Price } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

import { pruneDatabase } from "../../../__tests__/utils";
import { IngestionService } from "../../IngestionService";
import * as clickhouseWriteExports from "../../ClickhouseWriter";

const mockAddToClickhouseWriter = vi.fn();
const mockClickhouseClient = {
  query: async () => ({
    json: async () => [],
    query_id: "1",
    response_headers: { "x-clickhouse-summary": [] },
  }),
};

vi.mock("../../ClickhouseWriter", async (importOriginal) => {
  const original = (await importOriginal()) as {};
  return {
    ...original,
    ClickhouseWriter: {
      getInstance: () => ({
        addToQueue: mockAddToClickhouseWriter,
      }),
    },
  };
});

const mockIngestionService = new IngestionService(
  null as any,
  prisma,
  clickhouseWriteExports.ClickhouseWriter.getInstance() as any,
  mockClickhouseClient as any,
);

describe("Token Cost Calculation", () => {
  const modelName = "gpt-test-" + uuidv4();
  const matchPattern = `(?i)^(${modelName})$`;
  const traceId = uuidv4();
  const generationId = uuidv4();
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  const modelId = uuidv4();
  const tokenModelData = {
    id: modelId,
    modelName,
    matchPattern,
    tokenizerId: "openai",
    tokenizerConfig: {
      tokensPerName: 1,
      tokenizerModel: "gpt-4o",
      tokensPerMessage: 3,
    },
  };

  const modelPrices: Pick<Price, "price" | "usageType">[] = [
    {
      price: new Decimal(0.01),
      usageType: "input",
    },
    {
      price: new Decimal(0.02),
      usageType: "output",
    },
    {
      price: new Decimal(0.03),
      usageType: "total",
    },
  ];

  beforeEach(async () => {
    await pruneDatabase();
    await prisma.model.create({
      data: tokenModelData,
    });
    await Promise.all([
      prisma.price.createMany({
        data: modelPrices.map((price) => ({
          modelId,
          projectId: null,
          usageType: price.usageType,
          price: price.price,
        })),
      }),
    ]);
    vi.clearAllMocks();
  });

  it("should correctly calculate token costs with provided model prices", async () => {
    const prices = await prisma.price.findMany({
      where: {
        modelId,
      },
    });

    const usageUnits = {
      input: 100,
      output: 200,
      total: 300,
    };

    const userProvidedCosts = {
      input: null,
      output: null,
      total: null,
    };

    const costs = (IngestionService as any).calculateUsageCosts(
      prices as any,
      userProvidedCosts,
      usageUnits,
    );

    expect(costs.cost_details.input).toBe(1.0); // 100 tokens * 0.01
    expect(costs.cost_details.output).toBe(4.0); // 200 tokens * 0.02
    expect(costs.cost_details.total).toBe(9.0); // 300 tokens * 0.03
    expect(costs.total_cost).toBe(9.0);
  });

  it("should correctly calculate token costs with user provided costs", async () => {
    const prices = await prisma.price.findMany({
      where: {
        modelId,
      },
    });

    const usageUnits = {
      input: 100,
      output: 200,
      total: 300,
    };

    const userProvidedCosts = {
      input: 2.0,
      output: 3.0,
      total: 5.0,
    };

    const costs = (IngestionService as any).calculateUsageCosts(
      prices as any,
      { provided_cost_details: userProvidedCosts },
      usageUnits,
    );

    expect(costs.cost_details.input).toBe(2.0); // Overridden by user provided cost
    expect(costs.cost_details.output).toBe(3.0); // Overridden by user provided cost
    expect(costs.cost_details.total).toBe(5.0); // Overridden by user provided cost
    expect(costs.total_cost).toBe(5.0);
  });

  it("should correctly calculate token costs when only some user provided costs are given", async () => {
    const prices = await prisma.price.findMany({
      where: {
        modelId,
      },
    });

    const data = [
      // missing total
      {
        userProvidedCosts: {
          input: 1,
          output: 2,
        },
        expectedCost: {
          input_cost: 1,
          output_cost: 2,
          total_cost: 3,
        },
      },
      // only total
      {
        userProvidedCosts: {
          total: 2,
        },
        expectedCost: {
          total_cost: 2,
        },
      },
      // missing input
      {
        userProvidedCosts: {
          output: 2,
          total: 2,
        },
        expectedCost: {
          output_cost: 2,
          total_cost: 2,
        },
      },
      // only input
      {
        userProvidedCosts: {
          input: 1,
        },
        expectedCost: {
          input_cost: 1,
          total_cost: 1,
        },
      },

      // missing output
      {
        userProvidedCosts: {
          input: 1,
          total: 1,
        },
        expectedCost: {
          input_cost: 1,
          output_cost: undefined,
          total_cost: 1,
        },
      },

      // only output
      {
        userProvidedCosts: {
          output: 2,
        },
        expectedCost: {
          input_cost: undefined,
          output_cost: 2,
          total_cost: 2,
        },
      },
    ];

    for (const { userProvidedCosts, expectedCost } of data) {
      const usageUnits = {
        input: 0,
        output: 0,
        total: 0,
      };

      const costs = (IngestionService as any).calculateUsageCosts(
        prices as any,
        { provided_cost_details: userProvidedCosts } as any,
        usageUnits,
      );

      expect(costs.cost_details.input).toBe(expectedCost.input_cost);
      expect(costs.cost_details.output).toBe(expectedCost.output_cost);
      expect(costs.cost_details.total).toBe(expectedCost.total_cost);
      expect(costs.total_cost).toBe(expectedCost.total_cost);
    }
  });

  it("should return empty costs if no model is provided", async () => {
    const usageUnits = {
      input: 100,
      output: 200,
      total: 300,
    };

    const userProvidedCosts = {
      input: null,
      output: null,
      total: null,
    };

    const costs = (IngestionService as any).calculateUsageCosts(
      null,
      userProvidedCosts,
      usageUnits,
    );

    expect(costs.cost_details.input).toBeUndefined();
    expect(costs.cost_details.output).toBeUndefined();
    expect(costs.cost_details.total).toBeUndefined();
    expect(costs.total_cost).toBeUndefined();
  });

  it("should handle zero token counts correctly", async () => {
    const prices = await prisma.price.findMany({
      where: {
        modelId,
      },
    });

    const usageUnits = {
      input: 0,
      output: 0,
      total: 0,
    };

    const userProvidedCosts = {
      input: null,
      output: null,
      total: null,
    };

    const costs = (IngestionService as any).calculateUsageCosts(
      prices as any,
      userProvidedCosts,
      usageUnits,
    );

    expect(costs.cost_details.input).toBe(0); // 0 tokens * 0.01
    expect(costs.cost_details.output).toBe(0); // 0 tokens * 0.02
    expect(costs.cost_details.total).toBe(0); // 0 tokens * 0.03
    expect(costs.total_cost).toBe(0);
  });

  it("should handle missing token counts correctly", async () => {
    const prices = await prisma.price.findMany({
      where: {
        modelId,
      },
    });

    const usageUnits = {
      input: undefined,
      output: undefined,
      total: undefined,
    };

    const userProvidedCosts = {
      input: null,
      output: null,
      total: null,
    };

    const costs = (IngestionService as any).calculateUsageCosts(
      prices as any,
      userProvidedCosts,
      usageUnits,
    );

    expect(costs.cost_details.input).toBeUndefined();
    expect(costs.cost_details.output).toBeUndefined();
    expect(costs.cost_details.total).toBeUndefined();
    expect(costs.total_cost).toBeUndefined();
  });

  it("should handle fractional token counts correctly", async () => {
    const prices = await prisma.price.findMany({
      where: {
        modelId,
      },
    });

    const usageUnits = {
      input: 150.5,
      output: 250.25,
      total: 400.75,
    };

    const userProvidedCosts = {
      input: null,
      output: null,
      total: null,
    };

    const costs = (IngestionService as any).calculateUsageCosts(
      prices as any,
      userProvidedCosts,
      usageUnits,
    );

    expect(costs.cost_details.input).toBeCloseTo(1.505); // 150.5 tokens * 0.01
    expect(costs.cost_details.output).toBeCloseTo(5.005); // 250.25 tokens * 0.02
    expect(costs.cost_details.total).toBeCloseTo(12.0225); // 400.75 tokens * 0.03
    expect(costs.total_cost).toBeCloseTo(12.0225);
  });

  it("should handle large token counts correctly", async () => {
    const prices = await prisma.price.findMany({
      where: {
        modelId,
      },
    });

    const usageUnits = {
      input: 1e6,
      output: 2e6,
      total: 3e6,
    };

    const userProvidedCosts = {
      input: null,
      output: null,
      total: null,
    };

    const costs = (IngestionService as any).calculateUsageCosts(
      prices as any,
      userProvidedCosts,
      usageUnits,
    );

    expect(costs.cost_details.input).toBe(10000); // 1e6 tokens * 0.01
    expect(costs.cost_details.output).toBe(40000); // 2e6 tokens * 0.02
    expect(costs.cost_details.total).toBe(90000); // 3e6 tokens * 0.03
    expect(costs.total_cost).toBe(90000);
  });

  it("should correctly match model prices from the database", async () => {
    const generationUsage = {
      model: modelName,
      usage: {
        input: 100,
        output: 200,
        total: 300,
      },
    };

    const generationId = uuidv4();

    const events = [
      {
        id: generationId,
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage,
        },
      },
    ];

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
      createdAtTimestamp: new Date(),
      observationEventList: events,
    });
    expect(mockAddToClickhouseWriter).toHaveBeenCalled();
    const args = mockAddToClickhouseWriter.mock.calls[0];
    const tableName = args[0];
    const generation = args[1];

    expect(tableName).toBe("observations");
    expect(generation).toBeDefined();
    expect(generation.type).toBe("GENERATION");

    // Model name should be matched

    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation.provided_cost_details.input).toBeUndefined();
    expect(generation.provided_cost_details.output).toBeUndefined();
    expect(generation.provided_cost_details.total).toBeUndefined();

    // Calculated cost
    expect(generation.cost_details.input).toBe(
      generationUsage.usage.input * modelPrices[0].price.toNumber(),
    );
    expect(generation.cost_details.output).toBe(
      generationUsage.usage.output * modelPrices[1].price.toNumber(),
    );
    expect(generation.cost_details.total).toBe(
      generationUsage.usage.total * modelPrices[2].price.toNumber(),
    );
    expect(generation.usage_details.input).toBe(generationUsage.usage.input);
    expect(generation.usage_details.output).toBe(generationUsage.usage.output);
    expect(generation.usage_details.total).toBe(generationUsage.usage.total);
  });

  it("should overwrite costs for a generation without previous user provided costs", async () => {
    const generationUsage1 = {
      model: modelName,
      usage: {
        input: 1,
        output: 2,
        total: 3,
      },
    };

    const generationUsage2 = {
      model: modelName,
      usage: {
        input: 100,
        output: 200,
        total: 300,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage2,
        },
      },
    ];

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
      createdAtTimestamp: new Date(),
      observationEventList: events,
    });
    expect(mockAddToClickhouseWriter).toHaveBeenCalled();
    const args = mockAddToClickhouseWriter.mock.calls[0];
    const tableName = args[0];
    const generation = args[1];

    expect(tableName).toBe("observations");
    expect(generation).toBeDefined();
    expect(generation.type).toBe("GENERATION");

    // Model name should be matched

    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation.provided_cost_details.input).toBeUndefined();
    expect(generation.provided_cost_details.output).toBeUndefined();
    expect(generation.provided_cost_details.total).toBeUndefined();

    // Calculated cost
    expect(generation.cost_details.input).toBe(
      generationUsage2.usage.input * modelPrices[0].price.toNumber(),
    );
    expect(generation.cost_details.output).toBe(
      generationUsage2.usage.output * modelPrices[1].price.toNumber(),
    );
    expect(generation.cost_details.total).toBe(
      generationUsage2.usage.total * modelPrices[2].price.toNumber(),
    );
    expect(generation.usage_details.input).toBe(generationUsage2.usage.input);
    expect(generation.usage_details.output).toBe(generationUsage2.usage.output);
    expect(generation.usage_details.total).toBe(generationUsage2.usage.total);
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
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage2,
        },
      },
    ];

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
      createdAtTimestamp: new Date(),
      observationEventList: events,
    });
    expect(mockAddToClickhouseWriter).toHaveBeenCalled();
    const args = mockAddToClickhouseWriter.mock.calls[0];
    const tableName = args[0];
    const generation = args[1];

    expect(tableName).toBe("observations");
    expect(generation).toBeDefined();
    expect(generation.type).toBe("GENERATION");

    // Model name should be matched

    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation.provided_cost_details.input).toBeUndefined();
    expect(generation.provided_cost_details.output).toBeUndefined();
    expect(generation.provided_cost_details.total).toBeUndefined();

    // Calculated cost
    expect(generation.cost_details.input).toBe(
      generationUsage2.usage.input * modelPrices[0].price.toNumber(),
    );
    expect(generation.cost_details.output).toBe(
      generationUsage2.usage.output * modelPrices[1].price.toNumber(),
    );
    expect(generation.cost_details.total).toBe(
      generationUsage2.usage.total * modelPrices[2].price.toNumber(),
    );
    expect(generation.usage_details.input).toBe(generationUsage2.usage.input);
    expect(generation.usage_details.output).toBe(generationUsage2.usage.output);
    expect(generation.usage_details.total).toBe(generationUsage2.usage.total);
  });

  it("should use the matched model of the previous generation call to calculate costs", async () => {
    const generationUsage1 = {
      model: modelName,
      usage: {
        input: 1,
        output: 2,
        total: 3,
      },
    };

    const generationUsage2 = {
      model: undefined, // No model provided
      usage: {
        input: 100,
        output: 200,
        total: 300,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage2,
        },
      },
    ];

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
      createdAtTimestamp: new Date(),
      observationEventList: events,
    });
    expect(mockAddToClickhouseWriter).toHaveBeenCalled();
    const args = mockAddToClickhouseWriter.mock.calls[0];
    const tableName = args[0];
    const generation = args[1];

    expect(tableName).toBe("observations");
    expect(generation).toBeDefined();
    expect(generation.type).toBe("GENERATION");

    // Model name should be matched

    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation.provided_cost_details.input).toBeUndefined();
    expect(generation.provided_cost_details.output).toBeUndefined();
    expect(generation.provided_cost_details.total).toBeUndefined();

    // Calculated cost
    expect(generation.cost_details.input).toBe(
      generationUsage2.usage.input * modelPrices[0].price.toNumber(),
    );
    expect(generation.cost_details.output).toBe(
      generationUsage2.usage.output * modelPrices[1].price.toNumber(),
    );
    expect(generation.cost_details.total).toBe(
      generationUsage2.usage.total * modelPrices[2].price.toNumber(),
    );
    expect(generation.usage_details.input).toBe(generationUsage2.usage.input);
    expect(generation.usage_details.output).toBe(generationUsage2.usage.output);
    expect(generation.usage_details.total).toBe(generationUsage2.usage.total);
  });

  it("should overwrite costs if new costs are user provided", async () => {
    const generationUsage1 = {
      model: modelName,
      usage: {
        input: 1,
        output: 2,
        total: 3,
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
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage2,
        },
      },
    ];

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
      createdAtTimestamp: new Date(),
      observationEventList: events,
    });
    expect(mockAddToClickhouseWriter).toHaveBeenCalled();
    const args = mockAddToClickhouseWriter.mock.calls[0];
    const tableName = args[0];
    const generation = args[1];

    expect(tableName).toBe("observations");
    expect(generation).toBeDefined();
    expect(generation.type).toBe("GENERATION");

    // Model name should be matched

    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // User provided cost
    expect(generation.provided_cost_details.input).toBe(
      generationUsage2.usage.inputCost,
    );
    expect(generation.provided_cost_details.output).toBe(
      generationUsage2.usage.outputCost,
    );
    expect(generation.provided_cost_details.total).toBe(
      generationUsage2.usage.totalCost,
    );

    // Calculated cost
    expect(generation.cost_details.input).toBe(
      generationUsage2.usage.inputCost,
    );
    expect(generation.cost_details.output).toBe(
      generationUsage2.usage.outputCost,
    );
    expect(generation.cost_details.total).toBe(
      generationUsage2.usage.totalCost,
    );
    expect(generation.usage_details.input).toBe(generationUsage2.usage.input);
    expect(generation.usage_details.output).toBe(generationUsage2.usage.output);
    expect(generation.usage_details.total).toBe(generationUsage2.usage.total);
  });

  it("should overwrite costs if new costs are user provided and zero", async () => {
    const generationUsage1 = {
      model: modelName,
      usage: {
        input: 1,
        output: 2,
        total: 3,
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
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage2,
        },
      },
    ];

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
      createdAtTimestamp: new Date(),
      observationEventList: events,
    });
    expect(mockAddToClickhouseWriter).toHaveBeenCalled();
    const args = mockAddToClickhouseWriter.mock.calls[0];
    const tableName = args[0];
    const generation = args[1];

    expect(tableName).toBe("observations");
    expect(generation).toBeDefined();
    expect(generation.type).toBe("GENERATION");

    // Model name should be matched

    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // User provided cost
    expect(generation.provided_cost_details.input).toBe(
      generationUsage2.usage.inputCost,
    );
    expect(generation.provided_cost_details.output).toBe(
      generationUsage2.usage.outputCost,
    );
    expect(generation.provided_cost_details.total).toBe(
      generationUsage2.usage.totalCost,
    );

    // Calculated cost
    expect(generation.cost_details.input).toBe(
      generationUsage2.usage.inputCost,
    );
    expect(generation.cost_details.output).toBe(
      generationUsage2.usage.outputCost,
    );
    expect(generation.cost_details.total).toBe(
      generationUsage2.usage.totalCost,
    );
    expect(generation.usage_details.input).toBe(generationUsage2.usage.input);
    expect(generation.usage_details.output).toBe(generationUsage2.usage.output);
    expect(generation.usage_details.total).toBe(generationUsage2.usage.total);
  });

  it("should overwrite costs if new costs are user provided and only partial", async () => {
    const generationUsage1 = {
      model: modelName,
      usage: {
        input: 1,
        output: 2,
        total: 3,
      },
    };

    const generationUsage2 = {
      model: modelName,
      usage: {
        outputCost: 1,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage2,
        },
      },
    ];

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
      createdAtTimestamp: new Date(),
      observationEventList: events,
    });
    expect(mockAddToClickhouseWriter).toHaveBeenCalled();
    const args = mockAddToClickhouseWriter.mock.calls[0];
    const tableName = args[0];
    const generation = args[1];

    expect(tableName).toBe("observations");
    expect(generation).toBeDefined();
    expect(generation.type).toBe("GENERATION");

    // Model name should be matched

    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // User provided cost
    expect(generation.provided_cost_details.input).toBe(undefined);
    expect(generation.provided_cost_details.output).toBe(
      generationUsage2.usage.outputCost,
    );
    expect(generation.provided_cost_details.total).toBe(undefined);

    // Calculated cost
    expect(generation.cost_details.input).toBe(undefined);
    expect(generation.cost_details.output).toBe(
      generationUsage2.usage.outputCost,
    );
    expect(generation.cost_details.total).toBe(1);
    expect(generation.usage_details.input).toBe(generationUsage1.usage.input);
    expect(generation.usage_details.output).toBe(generationUsage1.usage.output);
    expect(generation.usage_details.total).toBe(generationUsage1.usage.total);
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
      },
    };

    const generationUsage2 = {
      model: modelName,
      usage: {
        input: 100,
        output: 200,
        total: 300,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage2,
        },
      },
    ];

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
      createdAtTimestamp: new Date(),
      observationEventList: events,
    });
    expect(mockAddToClickhouseWriter).toHaveBeenCalled();
    const args = mockAddToClickhouseWriter.mock.calls[0];
    const tableName = args[0];
    const generation = args[1];

    expect(tableName).toBe("observations");
    expect(generation).toBeDefined();
    expect(generation.type).toBe("GENERATION");

    // Model name should be matched

    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // User provided cost
    expect(generation.provided_cost_details.input).toBe(
      generationUsage1.usage.inputCost,
    );
    expect(generation.provided_cost_details.output).toBe(
      generationUsage1.usage.outputCost,
    );
    expect(generation.provided_cost_details.total).toBe(
      generationUsage1.usage.totalCost,
    );

    // Calculated cost
    expect(generation.cost_details.input).toBe(
      generationUsage1.usage.inputCost,
    );
    expect(generation.cost_details.output).toBe(
      generationUsage1.usage.outputCost,
    );
    expect(generation.cost_details.total).toBe(
      generationUsage1.usage.totalCost,
    );
    expect(generation.usage_details.input).toBe(generationUsage2.usage.input);
    expect(generation.usage_details.output).toBe(generationUsage2.usage.output);
    expect(generation.usage_details.total).toBe(generationUsage2.usage.total);
  });

  it("should not calculate anything if no costs are provided and no model is matched", async () => {
    const generationUsage1 = {
      model: undefined, // No model provided
      usage: {
        input: 1,
        output: 2,
        total: 3,
      },
    };

    const generationUsage2 = {
      model: undefined, // No model provided
      usage: {
        input: 100,
        output: 200,
        total: 300,
      },
    };

    const events = [
      {
        id: uuidv4(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage2,
        },
      },
    ];

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
      createdAtTimestamp: new Date(),
      observationEventList: events,
    });
    expect(mockAddToClickhouseWriter).toHaveBeenCalled();
    const args = mockAddToClickhouseWriter.mock.calls[0];
    const tableName = args[0];
    const generation = args[1];

    expect(tableName).toBe("observations");
    expect(generation).toBeDefined();
    expect(generation.type).toBe("GENERATION");

    // Model name should not be matched
    expect(generation.internal_model).toBeUndefined();

    expect(generation.internal_model_id).toBeUndefined();

    // No user provided cost
    expect(generation.provided_cost_details.input).toBeUndefined();
    expect(generation.provided_cost_details.output).toBeUndefined();
    expect(generation.provided_cost_details.total).toBeUndefined();

    // No calculated cost
    expect(generation.cost_details.input).toBeUndefined();
    expect(generation.cost_details.output).toBeUndefined();
    expect(generation.cost_details.total).toBeUndefined();

    expect(generation.usage_details.input).toBe(generationUsage2.usage.input);
    expect(generation.usage_details.output).toBe(generationUsage2.usage.output);
    expect(generation.usage_details.total).toBe(generationUsage2.usage.total);
  });

  it("should use the tokens of the previous call without model if model comes with following call", async () => {
    const generationUsage1 = {
      model: undefined, // No model provided
      usage: {
        input: 1,
        output: 2,
        total: 3,
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
          startTime: new Date().toISOString(),
          ...generationUsage1,
        },
      },
      {
        id: uuidv4(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          startTime: new Date().toISOString(),
          ...generationUsage2,
        },
      },
    ];

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
      createdAtTimestamp: new Date(),
      observationEventList: events,
    });
    expect(mockAddToClickhouseWriter).toHaveBeenCalled();
    const args = mockAddToClickhouseWriter.mock.calls[0];
    const tableName = args[0];
    const generation = args[1];

    expect(tableName).toBe("observations");
    expect(generation).toBeDefined();
    expect(generation.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation.provided_cost_details.input).toBeUndefined();
    expect(generation.provided_cost_details.output).toBeUndefined();
    expect(generation.provided_cost_details.total).toBeUndefined();

    // Calculated cost
    expect(generation.cost_details.input).toBe(
      generationUsage1.usage.input * modelPrices[0].price.toNumber(),
    );
    expect(generation.cost_details.output).toBe(
      generationUsage1.usage.output * modelPrices[1].price.toNumber(),
    );
    expect(generation.cost_details.total).toBe(
      generationUsage1.usage.total * modelPrices[2].price.toNumber(),
    );
    expect(generation.usage_details.input).toBe(generationUsage1.usage.input);
    expect(generation.usage_details.output).toBe(generationUsage1.usage.output);
    expect(generation.usage_details.total).toBe(generationUsage1.usage.total);
  });
});
