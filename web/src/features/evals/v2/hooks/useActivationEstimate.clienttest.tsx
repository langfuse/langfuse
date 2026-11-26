import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useActivationEstimate } from "./useActivationEstimate";

const mocks = vi.hoisted(() => ({
  estimate: vi.fn().mockResolvedValue([
    {
      evaluatorId: "evaluator-1",
      matchingObservations: 20,
      sampling: 1,
      testRunCostUsd: 0.01,
      estimatedCostUsd: 0.2,
    },
  ]),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      client: {
        evalsV2: {
          activationCostEstimates: { mutate: mocks.estimate },
        },
      },
    }),
  },
}));

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: vi.fn(),
}));

describe("useActivationEstimate", () => {
  it("requests activation estimates for the selected evaluator", async () => {
    const { result } = renderHook(() =>
      useActivationEstimate({ projectId: "project-1" }),
    );

    await act(() =>
      result.current.requestActivation({
        targets: [
          {
            evaluatorId: "evaluator-1",
            evaluatorName: "Quality judge",
            filter: [],
            sampling: 1,
          },
        ],
        title: "Activate evaluation rule?",
        description: "Estimate details",
        confirmLabel: "Activate rule",
        onConfirm: async () => {},
      }),
    );

    expect(result.current.estimate).toMatchObject({
      status: "idle",
      sampling: 1,
      estimates: [{ evaluatorId: "evaluator-1", estimatedCostUsd: 0.2 }],
    });

    expect(mocks.estimate).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorIds: ["evaluator-1"],
      filter: [],
      sampling: 1,
      shouldRunMissingTest: undefined,
      knownTestRunCostUsd: undefined,
    });
  });
});
