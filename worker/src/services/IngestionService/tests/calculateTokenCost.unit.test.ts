import Decimal from "decimal.js";
import { v4 as uuidv4 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModelUsageUnit } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

import { pruneDatabase } from "../../../__tests__/utils";
import { IngestionService } from "../../IngestionService";
import * as clickhouseWriteExports from "../../ClickhouseWriter";

const mockAddToClickhouseWriter = vi.fn();
const mockClickhouseClient = {
  query: async () => ({ json: async () => [] }),
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
  mockClickhouseClient as any
);

describe("Token Cost Calculation", () => {
  const modelName = "gpt-test-" + uuidv4();
  const matchPattern = `(?i)^(${modelName})$`;
  const traceId = uuidv4();
  const generationId = uuidv4();
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  const tokenModelData = {
    id: uuidv4(),
    modelName,
    matchPattern,
    inputPrice: new Decimal(0.01),
    outputPrice: new Decimal(0.02),
    totalPrice: new Decimal(0.03),
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
    inputPrice: new Decimal(1),
    outputPrice: new Decimal(2),
    totalPrice: new Decimal(3),
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
    vi.clearAllMocks();
  });

  it("should correctly calculate token costs with provided model prices", async () => {
    const model = {
      inputPrice: new Decimal(0.01),
      outputPrice: new Decimal(0.02),
      totalPrice: new Decimal(0.03),
    };

    const tokenCounts = {
      input_usage_units: 100,
      output_usage_units: 200,
      total_usage_units: 300,
    };

    const userProvidedCosts = {
      provided_input_cost: null,
      provided_output_cost: null,
      provided_total_cost: null,
    };

    const costs = (IngestionService as any).calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts
    );

    expect(costs.input_cost).toBe(1.0); // 100 tokens * 0.01
    expect(costs.output_cost).toBe(4.0); // 200 tokens * 0.02
    expect(costs.total_cost).toBe(9.0); // 300 tokens * 0.03
  });

  it("should correctly calculate token costs with user provided costs", async () => {
    const model = {
      inputPrice: new Decimal(0.01),
      outputPrice: new Decimal(0.02),
    };

    const tokenCounts = {
      input_usage_units: 100,
      output_usage_units: 200,
      total_usage_units: 300,
    };

    const userProvidedCosts = {
      provided_input_cost: 2.0,
      provided_output_cost: 3.0,
      provided_total_cost: 5.0,
    };

    const costs = (IngestionService as any).calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts
    );

    expect(costs.input_cost).toBe(2.0); // Overridden by user provided cost
    expect(costs.output_cost).toBe(3.0); // Overridden by user provided cost
    expect(costs.total_cost).toBe(5.0); // Overridden by user provided cost
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
          provided_input_cost: 1,
          provided_output_cost: 2,
          provided_total_cost: undefined,
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
          provided_input_cost: undefined,
          provided_output_cost: undefined,
          provided_total_cost: 2,
        },
        expectedCost: {
          input_cost: undefined,
          output_cost: undefined,
          total_cost: 2,
        },
      },
      // missing input
      {
        userProvidedCosts: {
          provided_input_cost: undefined,
          provided_output_cost: 2,
          provided_total_cost: 2,
        },
        expectedCost: {
          input_cost: undefined,
          output_cost: 2,
          total_cost: 2,
        },
      },
      // only input
      {
        userProvidedCosts: {
          provided_input_cost: 1,
          provided_output_cost: undefined,
          provided_total_cost: undefined,
        },
        expectedCost: {
          input_cost: 1,
          output_cost: undefined,
          total_cost: 1,
        },
      },

      // missing output
      {
        userProvidedCosts: {
          provided_input_cost: 1,
          provided_output_cost: undefined,
          provided_total_cost: 1,
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
          provided_input_cost: undefined,
          provided_output_cost: 2,
          provided_total_cost: undefined,
        },
        expectedCost: {
          input_cost: undefined,
          output_cost: 2,
          total_cost: 2,
        },
      },
    ];

    for (const { userProvidedCosts, expectedCost } of data) {
      const tokenCounts = {
        input_usage_units: 0,
        output_usage_units: 0,
        total_usage_units: 0,
      };

      const costs = (IngestionService as any).calculateTokenCosts(
        model as any,
        userProvidedCosts as any,
        tokenCounts
      );

      expect(costs.input_cost).toBe(expectedCost.input_cost);
      expect(costs.output_cost).toBe(expectedCost.output_cost);
      expect(costs.total_cost).toBe(expectedCost.total_cost);
    }
  });

  it("should return empty costs if no model is provided", async () => {
    const tokenCounts = {
      input_usage_units: 100,
      output_usage_units: 200,
      total_usage_units: 300,
    };

    const userProvidedCosts = {
      provided_input_cost: null,
      provided_output_cost: null,
      provided_total_cost: null,
    };

    const costs = (IngestionService as any).calculateTokenCosts(
      null,
      userProvidedCosts,
      tokenCounts
    );

    expect(costs.input_cost).toBeUndefined();
    expect(costs.output_cost).toBeUndefined();
    expect(costs.total_cost).toBeUndefined();
  });

  it("should handle zero token counts correctly", async () => {
    const model = {
      inputPrice: new Decimal(0.01),
      outputPrice: new Decimal(0.02),
      totalPrice: new Decimal(0.03),
    };

    const tokenCounts = {
      input_usage_units: 0,
      output_usage_units: 0,
      total_usage_units: 0,
    };

    const userProvidedCosts = {
      provided_input_cost: null,
      provided_output_cost: null,
      provided_total_cost: null,
    };

    const costs = (IngestionService as any).calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts
    );

    expect(costs.input_cost).toBe(0); // 0 tokens * 0.01
    expect(costs.output_cost).toBe(0); // 0 tokens * 0.02
    expect(costs.total_cost).toBe(0); // 0 tokens * 0.03
  });

  it("should handle missing token counts correctly", async () => {
    const model = {
      inputPrice: new Decimal(0.01),
      outputPrice: new Decimal(0.02),
      totalPrice: new Decimal(0.03),
    };

    const tokenCounts = {
      input_usage_units: undefined,
      output_usage_units: undefined,
      total_usage_units: undefined,
    };

    const userProvidedCosts = {
      provided_input_cost: null,
      provided_output_cost: null,
      provided_total_cost: null,
    };

    const costs = (IngestionService as any).calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts
    );

    expect(costs.input_cost).toBeUndefined();
    expect(costs.output_cost).toBeUndefined();
    expect(costs.total_cost).toBeUndefined();
  });

  it("should handle fractional token counts correctly", async () => {
    const model = {
      inputPrice: new Decimal(0.01),
      outputPrice: new Decimal(0.02),
      totalPrice: new Decimal(0.03),
    };

    const tokenCounts = {
      input_usage_units: 150.5,
      output_usage_units: 250.25,
      total_usage_units: 400.75,
    };

    const userProvidedCosts = {
      provided_input_cost: null,
      provided_output_cost: null,
      provided_total_cost: null,
    };

    const costs = (IngestionService as any).calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts
    );

    expect(costs.input_cost).toBeCloseTo(1.505); // 150.5 tokens * 0.01
    expect(costs.output_cost).toBeCloseTo(5.005); // 250.25 tokens * 0.02
    expect(costs.total_cost).toBeCloseTo(12.0225); // 400.75 tokens * 0.03
  });

  it("should handle large token counts correctly", async () => {
    const model = {
      inputPrice: new Decimal(0.01),
      outputPrice: new Decimal(0.02),
      totalPrice: new Decimal(0.03),
    };

    const tokenCounts = {
      input_usage_units: 1e6,
      output_usage_units: 2e6,
      total_usage_units: 3e6,
    };

    const userProvidedCosts = {
      provided_input_cost: null,
      provided_output_cost: null,
      provided_total_cost: null,
    };

    const costs = (IngestionService as any).calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts
    );

    expect(costs.input_cost).toBe(10000); // 1e6 tokens * 0.01
    expect(costs.output_cost).toBe(40000); // 2e6 tokens * 0.02
    expect(costs.total_cost).toBe(90000); // 3e6 tokens * 0.03
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

    const generationId = uuidv4();

    const events = [
      {
        id: generationId,
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          ...generationUsage,
        },
      },
    ];

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
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

    expect(generation.unit).toEqual(tokenModelData.unit);
    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation.provided_input_cost).toBeUndefined();
    expect(generation.provided_output_cost).toBeUndefined();
    expect(generation.provided_total_cost).toBeUndefined();

    // Calculated cost
    expect(generation.input_cost).toBe(
      generationUsage.usage.input * tokenModelData.inputPrice.toNumber()
    );
    expect(generation.output_cost).toBe(
      generationUsage.usage.output * tokenModelData.outputPrice.toNumber()
    );
    expect(generation.total_cost).toBe(
      generationUsage.usage.total * tokenModelData.totalPrice.toNumber()
    );
    expect(generation.input_usage_units).toBe(generationUsage.usage.input);
    expect(generation.output_usage_units).toBe(generationUsage.usage.output);
    expect(generation.total_usage_units).toBe(generationUsage.usage.total);
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

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
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
    expect(generation.unit).toEqual(tokenModelData.unit);
    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation.provided_input_cost).toBeUndefined();
    expect(generation.provided_output_cost).toBeUndefined();
    expect(generation.provided_total_cost).toBeUndefined();

    // Calculated cost
    expect(generation.input_cost).toBe(
      generationUsage2.usage.input * tokenModelData.inputPrice.toNumber()
    );
    expect(generation.output_cost).toBe(
      generationUsage2.usage.output * tokenModelData.outputPrice.toNumber()
    );
    expect(generation.total_cost).toBe(
      generationUsage2.usage.total * tokenModelData.totalPrice.toNumber()
    );
    expect(generation.input_usage_units).toBe(generationUsage2.usage.input);
    expect(generation.output_usage_units).toBe(generationUsage2.usage.output);
    expect(generation.total_usage_units).toBe(generationUsage2.usage.total);
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

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
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
    expect(generation.unit).toEqual(tokenModelData.unit);
    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation.provided_input_cost).toBeUndefined();
    expect(generation.provided_output_cost).toBeUndefined();
    expect(generation.provided_total_cost).toBeUndefined();

    // Calculated cost
    expect(generation.input_cost).toBe(
      generationUsage2.usage.input * tokenModelData.inputPrice.toNumber()
    );
    expect(generation.output_cost).toBe(
      generationUsage2.usage.output * tokenModelData.outputPrice.toNumber()
    );
    expect(generation.total_cost).toBe(
      generationUsage2.usage.total * tokenModelData.totalPrice.toNumber()
    );
    expect(generation.input_usage_units).toBe(generationUsage2.usage.input);
    expect(generation.output_usage_units).toBe(generationUsage2.usage.output);
    expect(generation.total_usage_units).toBe(generationUsage2.usage.total);
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

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
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
    expect(generation.unit).toEqual(tokenModelData.unit);
    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation.provided_input_cost).toBeUndefined();
    expect(generation.provided_output_cost).toBeUndefined();
    expect(generation.provided_total_cost).toBeUndefined();

    // Calculated cost
    expect(generation.input_cost).toBe(
      generationUsage2.usage.input * tokenModelData.inputPrice.toNumber()
    );
    expect(generation.output_cost).toBe(
      generationUsage2.usage.output * tokenModelData.outputPrice.toNumber()
    );
    expect(generation.total_cost).toBe(
      generationUsage2.usage.total * tokenModelData.totalPrice.toNumber()
    );
    expect(generation.input_usage_units).toBe(generationUsage2.usage.input);
    expect(generation.output_usage_units).toBe(generationUsage2.usage.output);
    expect(generation.total_usage_units).toBe(generationUsage2.usage.total);
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

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
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

    expect(generation.unit).toEqual(ModelUsageUnit.Characters);

    // No user provided cost
    expect(generation.provided_input_cost).toBeUndefined();
    expect(generation.provided_output_cost).toBeUndefined();
    expect(generation.provided_total_cost).toBe(10);

    // Calculated cost
    expect(generation.input_cost).toBeUndefined();
    expect(generation.output_cost).toBeUndefined();
    expect(generation.total_cost).toBe(10);
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

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
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

    expect(generation.unit).toEqual(tokenModelData.unit);
    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // User provided cost
    expect(generation.provided_input_cost).toBe(
      generationUsage2.usage.inputCost
    );
    expect(generation.provided_output_cost).toBe(
      generationUsage2.usage.outputCost
    );
    expect(generation.provided_total_cost).toBe(
      generationUsage2.usage.totalCost
    );

    // Calculated cost
    expect(generation.input_cost).toBe(generationUsage2.usage.inputCost);
    expect(generation.output_cost).toBe(generationUsage2.usage.outputCost);
    expect(generation.total_cost).toBe(generationUsage2.usage.totalCost);
    expect(generation.input_usage_units).toBe(generationUsage2.usage.input);
    expect(generation.output_usage_units).toBe(generationUsage2.usage.output);
    expect(generation.total_usage_units).toBe(generationUsage2.usage.total);
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

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
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

    expect(generation.unit).toEqual(tokenModelData.unit);
    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // User provided cost
    expect(generation.provided_input_cost).toBe(
      generationUsage2.usage.inputCost
    );
    expect(generation.provided_output_cost).toBe(
      generationUsage2.usage.outputCost
    );
    expect(generation.provided_total_cost).toBe(
      generationUsage2.usage.totalCost
    );

    // Calculated cost
    expect(generation.input_cost).toBe(generationUsage2.usage.inputCost);
    expect(generation.output_cost).toBe(generationUsage2.usage.outputCost);
    expect(generation.total_cost).toBe(generationUsage2.usage.totalCost);
    expect(generation.input_usage_units).toBe(generationUsage2.usage.input);
    expect(generation.output_usage_units).toBe(generationUsage2.usage.output);
    expect(generation.total_usage_units).toBe(generationUsage2.usage.total);
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

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
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

    expect(generation.unit).toEqual(tokenModelData.unit);
    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // User provided cost
    expect(generation.provided_input_cost).toBe(undefined);
    expect(generation.provided_output_cost).toBe(
      generationUsage2.usage.outputCost
    );
    expect(generation.provided_total_cost).toBe(undefined);

    // Calculated cost
    expect(generation.input_cost).toBe(undefined);
    expect(generation.output_cost).toBe(generationUsage2.usage.outputCost);
    expect(generation.total_cost).toBe(1);
    expect(generation.input_usage_units).toBe(generationUsage1.usage.input);
    expect(generation.output_usage_units).toBe(generationUsage1.usage.output);
    expect(generation.total_usage_units).toBe(generationUsage1.usage.total);
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

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
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

    expect(generation.unit).toEqual(tokenModelData.unit);
    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // User provided cost
    expect(generation.provided_input_cost).toBe(
      generationUsage1.usage.inputCost
    );
    expect(generation.provided_output_cost).toBe(
      generationUsage1.usage.outputCost
    );
    expect(generation.provided_total_cost).toBe(
      generationUsage1.usage.totalCost
    );

    // Calculated cost
    expect(generation.input_cost).toBe(generationUsage1.usage.inputCost);
    expect(generation.output_cost).toBe(generationUsage1.usage.outputCost);
    expect(generation.total_cost).toBe(generationUsage1.usage.totalCost);
    expect(generation.input_usage_units).toBe(generationUsage2.usage.input);
    expect(generation.output_usage_units).toBe(generationUsage2.usage.output);
    expect(generation.total_usage_units).toBe(generationUsage2.usage.total);
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

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
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
    expect(generation.unit).toEqual(tokenModelData.unit);
    expect(generation.internal_model_id).toBeUndefined();

    // No user provided cost
    expect(generation.provided_input_cost).toBeUndefined();
    expect(generation.provided_output_cost).toBeUndefined();
    expect(generation.provided_total_cost).toBeUndefined();

    // No calculated cost
    expect(generation.input_cost).toBeUndefined();
    expect(generation.output_cost).toBeUndefined();
    expect(generation.total_cost).toBeUndefined();

    expect(generation.input_usage_units).toBe(generationUsage2.usage.input);
    expect(generation.output_usage_units).toBe(generationUsage2.usage.output);
    expect(generation.total_usage_units).toBe(generationUsage2.usage.total);
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

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
      observationEventList: events,
    });
    expect(mockAddToClickhouseWriter).toHaveBeenCalled();
    const args = mockAddToClickhouseWriter.mock.calls[0];
    const tableName = args[0];
    const generation = args[1];

    expect(tableName).toBe("observations");
    expect(generation).toBeDefined();
    expect(generation.type).toBe("GENERATION");
    expect(generation.type).toBe("GENERATION");

    // Model name should be matched
    expect(generation.unit).toEqual(imageModelData.unit);
    expect(generation.internal_model_id).toBe(imageModelData.id);

    // No user provided cost
    expect(generation.provided_input_cost).toBeUndefined();
    expect(generation.provided_output_cost).toBeUndefined();
    expect(generation.provided_total_cost).toBeUndefined();

    // Calculated cost
    expect(generation.input_cost).toBe(
      generationUsage2.usage.input * imageModelData.inputPrice.toNumber()
    );
    expect(generation.output_cost).toBe(
      generationUsage2.usage.output * imageModelData.outputPrice.toNumber()
    );
    expect(generation.total_cost).toBe(
      generationUsage2.usage.total * imageModelData.totalPrice.toNumber()
    );
    expect(generation.input_usage_units).toBe(generationUsage2.usage.input);
    expect(generation.output_usage_units).toBe(generationUsage2.usage.output);
    expect(generation.total_usage_units).toBe(generationUsage2.usage.total);
  });

  it("should take the latest user provided model for matching", async () => {
    // Create a new model with the same name but different prices
    const newModelData = {
      id: uuidv4(),
      modelName,
      matchPattern,
      startDate: new Date().toISOString(),
      inputPrice: new Decimal(tokenModelData.inputPrice.toNumber() * 2),
      outputPrice: new Decimal(tokenModelData.outputPrice.toNumber() * 2),
      totalPrice: new Decimal(tokenModelData.totalPrice.toNumber() * 2),
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

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
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
    expect(generation.unit).toEqual(newModelData.unit);
    expect(generation.internal_model_id).toBe(newModelData.id);

    // No user provided cost
    expect(generation.provided_input_cost).toBeUndefined();
    expect(generation.provided_output_cost).toBeUndefined();
    expect(generation.provided_total_cost).toBeUndefined();

    // Calculated cost
    expect(generation.input_cost).toBe(
      generationUsage.usage.input * newModelData.inputPrice.toNumber()
    );
    expect(generation.output_cost).toBe(
      generationUsage.usage.output * newModelData.outputPrice.toNumber()
    );
    expect(generation.total_cost).toBe(
      generationUsage.usage.total * newModelData.totalPrice.toNumber()
    );
    expect(generation.input_usage_units).toBe(generationUsage.usage.input);
    expect(generation.output_usage_units).toBe(generationUsage.usage.output);
    expect(generation.total_usage_units).toBe(generationUsage.usage.total);
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

    await (mockIngestionService as any).processObservationEventList({
      projectId,
      entityId: generationId,
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

    expect(generation.unit).toEqual(tokenModelData.unit);
    expect(generation.internal_model_id).toBe(tokenModelData.id);

    // No user provided cost
    expect(generation.provided_input_cost).toBeUndefined();
    expect(generation.provided_output_cost).toBeUndefined();
    expect(generation.provided_total_cost).toBeUndefined();

    // Calculated cost
    expect(generation.input_cost).toBe(
      generationUsage1.usage.input * tokenModelData.inputPrice.toNumber()
    );
    expect(generation.output_cost).toBe(
      generationUsage1.usage.output * tokenModelData.outputPrice.toNumber()
    );
    expect(generation.total_cost).toBe(
      generationUsage1.usage.total * tokenModelData.totalPrice.toNumber()
    );
    expect(generation.input_usage_units).toBe(generationUsage1.usage.input);
    expect(generation.output_usage_units).toBe(generationUsage1.usage.output);
    expect(generation.total_usage_units).toBe(generationUsage1.usage.total);
  });
});
