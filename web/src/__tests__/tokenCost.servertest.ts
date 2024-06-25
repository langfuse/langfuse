import { ObservationProcessor } from "@/src/server/api/services/EventProcessor";

describe("Token Cost Calculation", () => {
  it("should correctly calculate token costs with provided model prices", async () => {
    const model = {
      inputPrice: 0.01,
      outputPrice: 0.02,
      totalPrice: 0.03,
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

    expect(costs.inputCost).toBe(1.0); // 100 tokens * 0.01
    expect(costs.outputCost).toBe(4.0); // 200 tokens * 0.02
    expect(costs.totalCost).toBe(9.0); // 300 tokens * 0.03
  });

  it("should correctly calculate token costs with user provided costs", async () => {
    const model = {
      inputPrice: 0.01,
      outputPrice: 0.02,
      totalPrice: 0.03,
    };

    const tokenCounts = {
      input: 100,
      output: 200,
      total: 300,
    };

    const userProvidedCosts = {
      inputCost: 2.0,
      outputCost: 3.0,
      totalCost: 5.0,
    };

    const costs = ObservationProcessor.calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts,
    );

    expect(costs.inputCost).toBe(2.0); // Overridden by user provided cost
    expect(costs.outputCost).toBe(3.0); // Overridden by user provided cost
    expect(costs.totalCost).toBe(5.0); // Overridden by user provided cost
  });

  it("should correctly calculate token costs when only some user provided costs are given", async () => {
    const model = {
      inputPrice: 0.01,
      outputPrice: 0.02,
      totalPrice: 0.03,
    };

    const tokenCounts = {
      input: 100,
      output: 200,
      total: undefined,
    };

    const userProvidedCosts = {
      inputCost: null,
      outputCost: 3.0,
      totalCost: null,
    };

    const costs = ObservationProcessor.calculateTokenCosts(
      model as any,
      userProvidedCosts,
      tokenCounts,
    );

    expect(costs.inputCost).toBe(1.0); // Calculated based on model price
    expect(costs.outputCost).toBe(3.0); // Overridden by user provided cost
    expect(costs.totalCost).toBe(4.0); // Sum of input and output costs
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

    expect(costs.inputCost).toBeUndefined();
    expect(costs.outputCost).toBeUndefined();
    expect(costs.totalCost).toBeUndefined();
  });

  it("should handle zero token counts correctly", async () => {
    const model = {
      inputPrice: 0.01,
      outputPrice: 0.02,
      totalPrice: 0.03,
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

    expect(costs.inputCost).toBe(0); // 0 tokens * 0.01
    expect(costs.outputCost).toBe(0); // 0 tokens * 0.02
    expect(costs.totalCost).toBe(0); // 0 tokens * 0.03
  });

  it("should handle missing token counts correctly", async () => {
    const model = {
      inputPrice: 0.01,
      outputPrice: 0.02,
      totalPrice: 0.03,
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

    expect(costs.inputCost).toBeUndefined();
    expect(costs.outputCost).toBeUndefined();
    expect(costs.totalCost).toBeUndefined();
  });

  it("should handle fractional token counts correctly", async () => {
    const model = {
      inputPrice: 0.01,
      outputPrice: 0.02,
      totalPrice: 0.03,
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

    expect(costs.inputCost).toBeCloseTo(1.505); // 150.5 tokens * 0.01
    expect(costs.outputCost).toBeCloseTo(5.005); // 250.25 tokens * 0.02
    expect(costs.totalCost).toBeCloseTo(12.0225); // 400.75 tokens * 0.03
  });

  it("should handle large token counts correctly", async () => {
    const model = {
      inputPrice: 0.01,
      outputPrice: 0.02,
      totalPrice: 0.03,
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

    expect(costs.inputCost).toBe(10000); // 1e6 tokens * 0.01
    expect(costs.outputCost).toBe(40000); // 2e6 tokens * 0.02
    expect(costs.totalCost).toBe(90000); // 3e6 tokens * 0.03
  });
});
