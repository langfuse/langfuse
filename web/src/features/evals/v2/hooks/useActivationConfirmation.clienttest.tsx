import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useActivationConfirmation } from "./useActivationConfirmation";

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

describe("useActivationConfirmation", () => {
  it("owns estimate, sampling, and confirmation state with React state", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useActivationConfirmation({ projectId: "project-1" }),
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
        onConfirm,
      }),
    );

    expect(result.current.confirmation).toMatchObject({ open: true });
    expect(result.current.estimate).toMatchObject({
      status: "idle",
      sampling: 1,
      estimates: [{ evaluatorId: "evaluator-1", estimatedCostUsd: 0.2 }],
    });

    act(() => result.current.setSampling(0.5));
    await act(() => result.current.confirmActivation());

    expect(onConfirm).toHaveBeenCalledWith(0.5);
    expect(result.current.confirmation).toMatchObject({
      open: false,
      isConfirming: false,
    });
  });
});
