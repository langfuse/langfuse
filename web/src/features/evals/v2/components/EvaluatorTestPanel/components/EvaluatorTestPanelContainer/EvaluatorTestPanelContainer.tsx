import type { ReactNode } from "react";
import { TopicsTargetObject } from "@langfuse/shared";
import { useStore } from "zustand";

import { useCanViewTraceTranscriptsEvals } from "@/src/features/evals/transcriptEvalsAccess";
import { EvaluatorTestPanel } from "@/src/features/evals/v2/components/EvaluatorTestPanel/EvaluatorTestPanel";
import { TestSectionContainer } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestSectionContainer/TestSectionContainer";
import { EvaluatorTestStrip } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorTestStrip/EvaluatorTestStrip";
import {
  selectHasValidModel,
  type EvaluatorSetupStore,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

/** Off the trace-evals gate the panel tests observations; on it, `heading` picks the target. */
export function EvaluatorTestPanelContainer({
  projectId,
  store,
  sampleSelector,
  traceSampleSelector,
  heading,
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
  traceSampleSelector: ReactNode;
  heading: ReactNode;
  testResult: unknown;
  testPending: boolean;
  rawResultOpen: boolean;
  onRawResultOpenChange: (open: boolean) => void;
  onRunTest: () => void;
  onOpenExecutionTrace: (traceId: string) => void;
}) {
  const traceEvalsAvailable = useCanViewTraceTranscriptsEvals(projectId);
  const open = useStore(store, (state) => state.testPanelOpen);
  const hasValidModel = useStore(store, selectHasValidModel);
  const isTraceTarget = useStore(
    store,
    (state) => state.targetObject === TopicsTargetObject,
  );
  const actions = store.getState().actions;

  if (!traceEvalsAvailable) {
    return (
      <EvaluatorTestPanel
        open={open}
        onOpenChange={actions.setTestPanelOpen}
        sampleSelector={sampleSelector}
        testSection={
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
        }
      />
    );
  }

  return (
    <EvaluatorTestPanel
      open={open}
      onOpenChange={actions.setTestPanelOpen}
      pinTestSection
      heading={heading}
      sampleSelector={isTraceTarget ? traceSampleSelector : sampleSelector}
      testSection={
        <EvaluatorTestStrip
          projectId={projectId}
          store={store}
          testResult={testResult}
          testPending={testPending}
          onRunTest={onRunTest}
        />
      }
    />
  );
}
