import {
  EvalTargetObject,
  isTraceTranscriptEvalType,
  TopicsTargetObject,
} from "@langfuse/shared";
import { useStore } from "zustand";

import { FeatureReleaseStatus } from "@/src/components/design-system/FeatureReleaseStatus/FeatureReleaseStatus";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import type {
  EvaluatorSetupStore,
  EvaluatorTargetObject,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function SampleScopeSwitcher({
  store,
  onTargetObjectChange,
}: {
  store: EvaluatorSetupStore;
  onTargetObjectChange: (targetObject: EvaluatorTargetObject) => void;
}) {
  const targetObject = useStore(store, (state) => state.targetObject);
  const traceAvailable = useStore(store, (state) =>
    isTraceTranscriptEvalType(state.type),
  );

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <h2 className="text-base font-bold whitespace-nowrap">Evaluate</h2>
      <div className="min-w-0">
        <Tabs
          value={targetObject}
          onValueChange={(value) =>
            onTargetObjectChange(
              value === TopicsTargetObject
                ? TopicsTargetObject
                : EvalTargetObject.EVENT,
            )
          }
        >
          <Tabs.List
            variant="inset"
            size="md"
            emphasis="strong"
            aria-label="Evaluate"
          >
            <Tabs.Trigger
              value={EvalTargetObject.EVENT}
              label="Observations"
              tooltip="Evaluate one observation's input, output, and metadata."
            />
            {traceAvailable ? (
              <Tabs.Trigger
                value={TopicsTargetObject}
                label="Traces"
                tooltip="Evaluate all the messages within a trace as one transcript."
                internal
              />
            ) : (
              <Tabs.Trigger
                value={TopicsTargetObject}
                disabled
                title="Coming soon"
              >
                Traces
                <FeatureReleaseStatus status="coming-soon" />
              </Tabs.Trigger>
            )}
          </Tabs.List>
        </Tabs>
      </div>
    </div>
  );
}
