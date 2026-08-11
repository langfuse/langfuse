import { Profiler, type ReactNode } from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelector/SampleObservationSelector";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { EvaluatorTestPanelContainer } from "./EvaluatorTestPanelContainer";

const shellRender = vi.hoisted(() => vi.fn());
const resultRender = vi.hoisted(() => vi.fn());

vi.mock(
  "@/src/features/evals/v2/components/EvaluatorTestPanel/EvaluatorTestPanel",
  () => ({
    EvaluatorTestPanel: ({ testSection }: { testSection: ReactNode }) => {
      shellRender();
      return testSection;
    },
  }),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    events: {
      batchIO: {
        useQuery: (_input: unknown, options: { enabled: boolean }) => ({
          data: options.enabled ? { input: "sample" } : undefined,
        }),
      },
    },
  },
  sendAsPostOption: {},
}));

vi.mock(
  "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultPanelView/TestResultPanelView",
  () => ({
    TestResultPanelView: ({
      traceActions,
      rerunAction,
    }: {
      traceActions: ReactNode;
      rerunAction: ReactNode;
    }) => {
      resultRender();
      return (
        <>
          {traceActions}
          {rerunAction}
        </>
      );
    },
  }),
);

describe("EvaluatorTestPanelContainer", () => {
  it("does not rerender for prompt edits that keep test availability unchanged", () => {
    const store = createEvaluatorSetupStore({ initialEvaluator: null });
    const onRender = vi.fn();

    render(
      <TooltipProvider>
        <Profiler id="test-panel" onRender={onRender}>
          <EvaluatorTestPanelContainer
            projectId="project-1"
            store={store}
            sampleSelector={<div>Sample selector</div>}
            testResult={null}
            testPending={false}
            rawResultOpen={false}
            onRawResultOpenChange={vi.fn()}
            onRunTest={vi.fn()}
            onOpenSampleTrace={vi.fn()}
            onOpenExecutionTrace={vi.fn()}
          />
        </Profiler>
      </TooltipProvider>,
    );
    const initialCommitCount = onRender.mock.calls.length;
    expect(initialCommitCount).toBeGreaterThan(0);

    act(() => store.getState().actions.setPrompt("Updated prompt"));
    expect(onRender).toHaveBeenCalledTimes(initialCommitCount);

    act(() => store.getState().actions.setType("CODE"));
    expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
  });

  it("does not rerender the panel shell when the sample changes", () => {
    const store = createEvaluatorSetupStore({ initialEvaluator: null });
    const panel = (
      <EvaluatorTestPanelContainer
        projectId="project-1"
        store={store}
        sampleSelector={<div>Sample selector</div>}
        testResult={null}
        testPending={false}
        rawResultOpen={false}
        onRawResultOpenChange={vi.fn()}
        onRunTest={vi.fn()}
        onOpenSampleTrace={vi.fn()}
        onOpenExecutionTrace={vi.fn()}
      />
    );
    render(<TooltipProvider>{panel}</TooltipProvider>);
    const initialShellRenders = shellRender.mock.calls.length;

    act(() =>
      store.getState().actions.setSelectedObservation({
        id: "observation-id",
        traceId: "trace-id",
        startTime: new Date("2026-08-11T10:00:00.000Z"),
      } as SampleObservation),
    );

    expect(shellRender).toHaveBeenCalledTimes(initialShellRenders);
  });

  it("does not rerender an existing test result when the sample changes", () => {
    const store = createEvaluatorSetupStore({ initialEvaluator: null });
    store.getState().actions.setSelectedObservation({
      id: "observation-1",
      traceId: "trace-1",
      startTime: new Date("2026-08-11T10:00:00.000Z"),
    } as SampleObservation);
    const panel = (
      <EvaluatorTestPanelContainer
        projectId="project-1"
        store={store}
        sampleSelector={<div>Sample selector</div>}
        testResult={{ result: { score: 1 } }}
        testPending={false}
        rawResultOpen={false}
        onRawResultOpenChange={vi.fn()}
        onRunTest={vi.fn()}
        onOpenSampleTrace={vi.fn()}
        onOpenExecutionTrace={vi.fn()}
      />
    );
    render(<TooltipProvider>{panel}</TooltipProvider>);
    const initialResultRenders = resultRender.mock.calls.length;

    act(() =>
      store.getState().actions.setSelectedObservation({
        id: "observation-2",
        traceId: "trace-2",
        startTime: new Date("2026-08-11T11:00:00.000Z"),
      } as SampleObservation),
    );

    expect(resultRender).toHaveBeenCalledTimes(initialResultRenders);
  });
});
