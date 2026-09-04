import { act, renderHook, waitFor } from "@testing-library/react";

import { getInAppAgentPageContext } from "@/src/features/in-app-agent";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { useEvaluatorSamplePageContext } from "./useEvaluatorSamplePageContext";

describe("useEvaluatorSamplePageContext", () => {
  it("registers the current sample and cleans it up on unmount", async () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "CODE",
      mode: "create",
    });
    const { unmount } = renderHook(() =>
      useEvaluatorSamplePageContext({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        store,
      }),
    );
    const setSelectedObservation =
      store.getState().actions.setSelectedObservation;
    type SelectedObservation = Parameters<typeof setSelectedObservation>[0];

    act(() => {
      setSelectedObservation({
        id: "observation-1",
        traceId: "trace-1",
        startTime: new Date("2026-09-04T12:00:00.000Z"),
      } as SelectedObservation);
    });

    await waitFor(() => {
      expect(getInAppAgentPageContext("project-1")).toContainEqual({
        description: "selected_evaluator_sample",
        value:
          '{"projectId":"project-1","evaluatorId":"evaluator-1","observationId":"observation-1","traceId":"trace-1","startTime":"2026-09-04T12:00:00.000Z"}',
      });
    });

    unmount();
    expect(getInAppAgentPageContext("project-1")).toEqual([]);
  });
});
