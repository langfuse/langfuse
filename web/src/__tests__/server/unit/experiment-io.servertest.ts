import { describe, expect, it } from "vitest";
import {
  experimentBatchIOInput,
  limitExperimentIO,
} from "@/src/features/experiments/server/experimentIo";

const request = {
  projectId: "project-1",
  itemIds: Array.from({ length: 50 }, (_, i) => `item-${i}`),
  baseExperimentId: "baseline",
  compExperimentIds: Array.from({ length: 9 }, (_, i) => `comparison-${i}`),
};

describe("experiment formatted I/O request bounds", () => {
  it("accepts one maximum-sized comparison page", () => {
    expect(
      experimentBatchIOInput.parse({ ...request, includeFullIo: true })
        .includeFullIo,
    ).toBe(true);
  });

  it("keeps compact reads as the default without adding new restrictions", () => {
    expect(
      experimentBatchIOInput.parse({
        ...request,
        itemIds: [...request.itemIds, "extra"],
        compExperimentIds: [...request.compExperimentIds, "extra"],
      }).includeFullIo,
    ).toBe(false);
  });

  it.each([
    { ...request, baseExperimentId: undefined, compExperimentIds: [] },
    { ...request, itemIds: [...request.itemIds, "extra"] },
    { ...request, compExperimentIds: [...request.compExperimentIds, "extra"] },
  ])("rejects an oversized formatted request before querying", (input) => {
    expect(
      experimentBatchIOInput.safeParse({ ...input, includeFullIo: true })
        .success,
    ).toBe(false);
  });

  it("allows ten comparisons when no baseline is selected", () => {
    expect(
      experimentBatchIOInput.safeParse({
        ...request,
        baseExperimentId: undefined,
        compExperimentIds: [...request.compExperimentIds, "tenth"],
        includeFullIo: true,
      }).success,
    ).toBe(true);
  });
});

describe("experiment formatted I/O response budget", () => {
  it("retains ordinary fields and existing preview signals without mutating input", () => {
    const rows = [
      {
        itemId: "item-1",
        input: "input",
        expectedOutput: null,
        inputTruncated: true,
        outputs: [
          {
            experimentId: "baseline",
            output: "output",
            outputTruncated: false,
          },
        ],
      },
    ];
    const result = limitExperimentIO(rows);
    expect(result[0]).toEqual({ ...rows[0], expectedOutputTruncated: false });
    expect(rows[0]).not.toHaveProperty("expectedOutputTruncated");
  });

  it("bounds a maximum page and marks every shortened field", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      itemId: `item-${i}`,
      input: "x".repeat(10_000),
      expectedOutput: "x".repeat(10_000),
      outputs: Array.from({ length: 10 }, (_, j) => ({
        experimentId: `experiment-${j}`,
        output: "x".repeat(10_000),
      })),
    }));
    const result = limitExperimentIO(rows);
    const returnedCharacters = result.reduce(
      (sum, row) =>
        sum +
        (row.input?.length ?? 0) +
        (row.expectedOutput?.length ?? 0) +
        row.outputs.reduce(
          (outputSum, output) => outputSum + (output.output?.length ?? 0),
          0,
        ),
      0,
    );
    expect(returnedCharacters).toBe(2_000_000);
    expect(result[0].input).toBe(rows[0].input);
    expect(result.at(-1)?.inputTruncated).toBe(true);
    expect(result.at(-1)?.expectedOutputTruncated).toBe(true);
    expect(
      result.at(-1)?.outputs.every((output) => output.outputTruncated),
    ).toBe(true);
    expect(rows.at(-1)?.input.length).toBe(10_000);
  });

  it("does not cut an emoji between its UTF-16 surrogates at the budget edge", () => {
    const rows = Array.from({ length: 17 }, (_, i) => ({
      itemId: `item-${i}`,
      input: "x".repeat(10_000),
      expectedOutput: "x".repeat(10_000),
      outputs: Array.from({ length: 10 }, (_, j) => ({
        experimentId: `experiment-${j}`,
        output: "x".repeat(10_000),
      })),
    }));
    rows[0].input = "x".repeat(9_999);
    rows[16].outputs[6].output = "😀tail";
    const result = limitExperimentIO(rows);
    expect(result[16].outputs[6]).toMatchObject({
      output: "",
      outputTruncated: true,
    });
    expect(result[16].outputs[7]).toMatchObject({
      output: "x",
      outputTruncated: true,
    });
  });
});
