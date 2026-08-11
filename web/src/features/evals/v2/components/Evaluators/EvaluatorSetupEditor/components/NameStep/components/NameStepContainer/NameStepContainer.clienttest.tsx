import { Profiler } from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelector/SampleObservationSelector";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { NameStepContainer } from "./NameStepContainer";

describe("NameStepContainer", () => {
  it("does not rerender when the selected sample changes", () => {
    const store = createEvaluatorSetupStore({ initialEvaluator: null });
    const onRender = vi.fn();

    render(
      <Profiler id="name-editor" onRender={onRender}>
        <NameStepContainer
          store={store}
          isSuggestingName={false}
          onStepOpenChange={vi.fn()}
        />
      </Profiler>,
    );
    const initialCommitCount = onRender.mock.calls.length;
    expect(initialCommitCount).toBeGreaterThan(0);

    act(() =>
      store.getState().actions.setSelectedObservation({
        id: "observation-id",
      } as SampleObservation),
    );

    expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
  });
});
