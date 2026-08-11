import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelector/SampleObservationSelector";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { VariableMappingEditorContainer } from "./VariableMappingEditorContainer";

const testState = vi.hoisted(() => ({
  detailsById: new Map<string, Record<string, unknown>>(),
  variableMappingRender: vi.fn(),
}));

vi.mock(
  "@/src/features/evals/v2/components/VariableMapping/VariableMapping",
  () => ({
    VariableMapping: ({ sourceObject }: { sourceObject: unknown }) => {
      testState.variableMappingRender(sourceObject);
      return <div>Variable mapping</div>;
    },
  }),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    events: {
      batchIO: {
        useQuery: (
          input: { observations: Array<{ id: string }> },
          options: {
            enabled: boolean;
            select: (
              data: Array<Record<string, unknown>>,
            ) => Record<string, unknown>;
          },
        ) => {
          const details = testState.detailsById.get(
            input.observations[0]?.id ?? "",
          );
          return {
            data:
              options.enabled && details
                ? options.select([details])
                : undefined,
          };
        },
      },
    },
  },
  sendAsPostOption: {},
}));

describe("VariableMappingEditorContainer", () => {
  it("keeps the completed preview until the newly selected sample is loaded", () => {
    const store = createEvaluatorSetupStore({ initialEvaluator: null });
    const firstObservation = {
      id: "observation-1",
      traceId: "trace-1",
      startTime: new Date("2026-08-11T10:00:00.000Z"),
    } as SampleObservation;
    const secondObservation = {
      id: "observation-2",
      traceId: "trace-2",
      startTime: new Date("2026-08-11T11:00:00.000Z"),
    } as SampleObservation;
    testState.detailsById.set(firstObservation.id, {
      id: firstObservation.id,
      input: "first",
    });
    store.getState().actions.setSelectedObservation(firstObservation);

    const view = () => (
      <VariableMappingEditorContainer projectId="project-1" store={store} />
    );
    const { rerender } = render(view());
    const completedPreviewRenderCount =
      testState.variableMappingRender.mock.calls.length;

    act(() =>
      store.getState().actions.setSelectedObservation(secondObservation),
    );

    expect(testState.variableMappingRender).toHaveBeenCalledTimes(
      completedPreviewRenderCount,
    );

    testState.detailsById.set(secondObservation.id, {
      id: secondObservation.id,
      input: "second",
    });
    rerender(view());

    expect(testState.variableMappingRender).toHaveBeenCalledTimes(
      completedPreviewRenderCount + 1,
    );
    expect(testState.variableMappingRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: secondObservation.id, input: "second" }),
    );
  });
});
