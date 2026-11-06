import type { ReactNode } from "react";
import { useStore } from "zustand";

import { EvaluatorTestPanel } from "@/src/features/evals/v2/components/EvaluatorTestPanel/EvaluatorTestPanel";
import { TestSectionContainer } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestSectionContainer/TestSectionContainer";
import { EvaluatorTestStrip } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorTestStrip/EvaluatorTestStrip";
import { SampleScopeMenu } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleScopeMenu/SampleScopeMenu";
import {
  selectHasValidModel,
  type EvaluatorSetupStore,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function EvaluatorTestPanelContainer({
  projectId,
  store,
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
  sampleSelector: ReactNode;
  testResult: unknown;
  testPending: boolean;
  rawResultOpen: boolean;
  onRawResultOpenChange: (open: boolean) => void;
  onRunTest: () => void;
  onOpenExecutionTrace: (traceId: string) => void;
}) {
  const open = useStore(store, (state) => state.testPanelOpen);
  const hasValidModel = useStore(store, selectHasValidModel);
  const sampleScope = useStore(store, (state) => state.sampleScope);
  const samplePresentation = useStore(
    store,
    (state) => state.samplePresentation,
  );
  const actions = store.getState().actions;
  const traceDetail = samplePresentation === "detail";

  return (
    <EvaluatorTestPanel
      open={open}
      onOpenChange={actions.setTestPanelOpen}
      pinTestSection={traceDetail}
      scopeControl={
        <SampleScopeMenu
          value={sampleScope}
          onChange={actions.setSampleScope}
        />
      }
      sampleSelector={sampleSelector}
      testSection={
        traceDetail ? (
          <EvaluatorTestStrip
            projectId={projectId}
            store={store}
            hasValidModel={hasValidModel}
            testResult={testResult}
            testPending={testPending}
            onRunTest={onRunTest}
          />
        ) : (
          <TestSectionContainer
            projectId={projectId}
            store={store}
            hasValidModel={hasValidModel}
            testResult={testResult}
            testPending={testPending}
            rawResultOpen={rawResultOpen}
            onRawResultOpenChange={onRawResultOpenChange}
            onRunTest={onRunTest}
            onOpenExecutionTrace={onOpenExecutionTrace}
          />
        )
      }
    />
  );
}
