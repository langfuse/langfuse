import type { ReactNode } from "react";
import { useStore } from "zustand";

import { EvaluatorTestPanel } from "@/src/features/evals/v2/components/EvaluatorTestPanel/EvaluatorTestPanel";
import { TestSectionContainer } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestSectionContainer/TestSectionContainer";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function EvaluatorTestPanelContainer({
  projectId,
  store,
  defaultModel,
  sampleSelector,
  testResult,
  testPending,
  rawResultOpen,
  onRawResultOpenChange,
  onRunTest,
  onOpenExecutionTrace,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  defaultModel: JudgeModel | null;
  sampleSelector: ReactNode;
  testResult: unknown;
  testPending: boolean;
  rawResultOpen: boolean;
  onRawResultOpenChange: (open: boolean) => void;
  onRunTest: () => void;
  onOpenExecutionTrace: (traceId: string) => void;
}) {
  const open = useStore(store, (state) => state.testPanelOpen);
  const actions = store.getState().actions;

  return (
    <EvaluatorTestPanel
      open={open}
      onOpenChange={actions.setTestPanelOpen}
      sampleSelector={sampleSelector}
      testSection={
        <TestSectionContainer
          projectId={projectId}
          store={store}
          defaultModel={defaultModel}
          testResult={testResult}
          testPending={testPending}
          rawResultOpen={rawResultOpen}
          onRawResultOpenChange={onRawResultOpenChange}
          onRunTest={onRunTest}
          onOpenExecutionTrace={onOpenExecutionTrace}
        />
      }
    />
  );
}
