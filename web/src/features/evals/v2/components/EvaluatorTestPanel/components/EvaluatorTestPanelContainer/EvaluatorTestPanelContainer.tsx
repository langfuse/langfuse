import { isTraceTranscriptEvalType } from "@langfuse/shared";
import { useStore } from "zustand";

import { useCanViewTraceTranscriptsEvals } from "@/src/features/evals/transcriptEvalsAccess";
import { EvaluatorTestPanel } from "@/src/features/evals/v2/components/EvaluatorTestPanel/EvaluatorTestPanel";
import { SampleObservationSelectorContainer } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/SampleObservationSelectorContainer/SampleObservationSelectorContainer";
import { SampleScopeSwitcher } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/SampleScopeSwitcher/SampleScopeSwitcher";
import { TraceSampleSelectorContainer } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TraceSampleSelectorContainer/TraceSampleSelectorContainer";
import { TestSectionContainer } from "@/src/features/evals/v2/components/EvaluatorTestPanel/components/TestSection/components/TestSectionContainer/TestSectionContainer";
import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { EvaluatorTestStrip } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorTestStrip/EvaluatorTestStrip";
import {
  selectHasValidModel,
  selectSampleScope,
  type EvaluatorSampleScope,
  type EvaluatorSetupStore,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import type { AbsoluteTimeRange } from "@/src/utils/date-range-utils";

/**
 * The trace-evals gate for the test panel: off renders the observation panel,
 * on renders the scope-aware panel. Shared pieces stay flag-free.
 */
export function EvaluatorTestPanelContainer({
  projectId,
  store,
  timeRange,
  onOpenTrace,
  onScopeChange,
  testResult,
  testPending,
  rawResultOpen,
  onRawResultOpenChange,
  onRunTest,
  onOpenExecutionTrace,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  timeRange: AbsoluteTimeRange | null;
  onOpenTrace: (observation: SampleObservation) => void;
  onScopeChange: (scope: EvaluatorSampleScope) => void;
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
  const sampleScope = useStore(store, selectSampleScope);
  const evaluatorType = useStore(store, (state) => state.type);
  const actions = store.getState().actions;

  if (!traceEvalsAvailable) {
    return (
      <EvaluatorTestPanel
        open={open}
        onOpenChange={actions.setTestPanelOpen}
        sampleSelector={
          <SampleObservationSelectorContainer
            store={store}
            projectId={projectId}
            timeRange={timeRange}
            onOpenTrace={onOpenTrace}
          />
        }
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
      heading={
        <SampleScopeSwitcher
          scope={sampleScope}
          onScopeChange={onScopeChange}
          traceComingSoon={!isTraceTranscriptEvalType(evaluatorType)}
        />
      }
      sampleSelector={
        sampleScope === "trace" ? (
          <TraceSampleSelectorContainer
            store={store}
            projectId={projectId}
            timeRange={timeRange}
            onOpenTrace={onOpenTrace}
          />
        ) : (
          <SampleObservationSelectorContainer
            store={store}
            projectId={projectId}
            timeRange={timeRange}
            onOpenTrace={onOpenTrace}
            samplePresentation="detail"
          />
        )
      }
      testSection={
        <EvaluatorTestStrip
          projectId={projectId}
          store={store}
          hasValidModel={hasValidModel}
          testResult={testResult}
          testPending={testPending}
          onRunTest={onRunTest}
        />
      }
    />
  );
}
