import { requestRuleActivation } from "./requestRuleActivation";

describe("requestRuleActivation", () => {
  it("activates directly without a dialog when no evaluators are attached", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const estimate = vi.fn();

    await requestRuleActivation({
      request: {
        targets: [],
        title: "Activate?",
        description: "Description",
        confirmLabel: "Activate",
        onConfirm,
      },
      estimate,
    });

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(estimate).not.toHaveBeenCalled();
  });

  it("prepares only available estimates for the confirmation dialog", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const estimate = vi.fn(async (targets: Array<{ evaluatorId: string }>) =>
      targets.map((target) =>
        target.evaluatorId === "available"
          ? {
              evaluatorId: target.evaluatorId,
              matchingObservations: 20,
              sampling: 0.5,
              testRunCostUsd: 0.01,
              estimatedCostUsd: 0.1,
            }
          : {
              evaluatorId: target.evaluatorId,
              matchingObservations: 20,
              sampling: 0.5,
              testRunCostUsd: null,
              estimatedCostUsd: null,
            },
      ),
    );

    const result = await requestRuleActivation({
      request: {
        targets: [
          {
            evaluatorId: "available",
            evaluatorName: "Available",
            filter: [],
            sampling: 0.5,
          },
          {
            evaluatorId: "unavailable",
            evaluatorName: "Unavailable",
            filter: [],
            sampling: 0.5,
          },
        ],
        title: "Activate?",
        description: "Description",
        confirmLabel: "Activate",
        onConfirm,
      },
      estimate,
    });

    expect(estimate).toHaveBeenCalledOnce();
    expect(estimate).toHaveBeenCalledWith([
      expect.objectContaining({ evaluatorId: "available" }),
      expect.objectContaining({ evaluatorId: "unavailable" }),
    ]);
    expect(result).toMatchObject({
      unavailableEstimateCount: 1,
      estimates: [
        {
          evaluatorId: "available",
          estimatedCostUsd: 0.1,
        },
      ],
    });
  });
});
