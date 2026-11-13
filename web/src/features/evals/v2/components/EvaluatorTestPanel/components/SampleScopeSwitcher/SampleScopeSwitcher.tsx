import { FeatureReleaseStatus } from "@/src/components/design-system/FeatureReleaseStatus/FeatureReleaseStatus";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import type { EvaluatorSampleScope } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function SampleScopeSwitcher({
  scope,
  onScopeChange,
  traceComingSoon = false,
}: {
  scope: EvaluatorSampleScope;
  onScopeChange: (scope: EvaluatorSampleScope) => void;
  /** Shows Trace disabled, e.g. for evaluator types without trace testing. */
  traceComingSoon?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <h2 className="font-bold whitespace-nowrap">Test with</h2>
      <Tabs
        value={scope}
        onValueChange={(value) =>
          onScopeChange(
            value === "trace" && !traceComingSoon ? "trace" : "observation",
          )
        }
      >
        <Tabs.List variant="inset" size="sm">
          <Tabs.Trigger
            value="observation"
            label="Observation"
            tooltip="Evaluate one observation's input, output, and metadata."
          />
          {traceComingSoon ? (
            <Tabs.Trigger value="trace" disabled title="Coming soon">
              Trace
              <FeatureReleaseStatus status="coming-soon" />
            </Tabs.Trigger>
          ) : (
            <Tabs.Trigger
              value="trace"
              label="Trace"
              tooltip="Evaluate the whole conversation of a trace as a transcript."
            />
          )}
        </Tabs.List>
      </Tabs>
      {scope === "trace" ? <FeatureReleaseStatus status="beta" /> : null}
    </div>
  );
}
