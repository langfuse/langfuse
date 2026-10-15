import { useState } from "react";
import { Info } from "lucide-react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { SwitchInput } from "@/src/components/design-system/SwitchInput/SwitchInput";
import { RuleSamplingSection } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleSamplingSection";
import { createRuleSetupStore } from "@/src/features/evals/v2/stores/createRuleSetupStore";
import {
  TOPICS_MODEL_SLOT_DETAILS,
  TOPICS_MODEL_SLOTS,
  type TopicsModelSlotName,
} from "@langfuse/shared/topics";

import { type FilterState } from "@langfuse/shared";
import { TopicAutomaticTraceScope } from "./TopicAutomaticTraceScope";

type AutomaticProcessingDialogProps = {
  projectId?: string;
  initialEnabled: boolean;
  initialSampling: number;
  traceIdleMs: number;
  models: Record<TopicsModelSlotName, string | null>;
  paused: { shortLabel: string; message: string } | null;
  saving: boolean;
  error: string | null;
  onSave: (input: { enabled: boolean; sampling: number }) => void;
};

const COST_NOTE =
  "Each sampled trace makes LLM calls on your connections, so cost depends on your trace volume, the selected models, and the sampling rate.";

/** Dialog content; render it from `AutomaticProcessingDialogController`. */
export function AutomaticProcessingDialog({
  error,
  projectId,
  initialEnabled,
  initialSampling,
  models,
  onSave,
  paused,
  saving,
  traceIdleMs,
}: AutomaticProcessingDialogProps) {
  const [samplingStore] = useState(() =>
    createRuleSetupStore({
      name: "",
      filter: [],
      sampling: initialSampling,
      assignments: [],
    }),
  );
  const [filters, setFilters] = useState<FilterState>([]);
  const [enabled, setEnabled] = useState(initialEnabled);
  const missingModel = TOPICS_MODEL_SLOTS.some((slot) => !models[slot]);
  return (
    <Dialog
      title="Automatic processing"
      size="lg"
      actions={[
        {
          label: "Save",
          loading: saving,
          disabled: saving || (enabled && missingModel),
          onClick: () =>
            onSave({ enabled, sampling: samplingStore.getState().sampling }),
        },
      ]}
    >
      <Dialog.Body>
        <div className="flex flex-col gap-4">
          <Alert variant="info" icon={Info}>
            <Alert.Description>
              Only traces from v4-ready ingestion are processed automatically.
              Legacy ingestion is not included.
            </Alert.Description>
          </Alert>
          <p className="text-sm">
            New traces are summarized with your saved facets and models once
            they have been idle for {idleTimeLabel(traceIdleMs)}. The sampling
            rate below applies only to automatic processing. For manual
            processing, such as backfills, you set the sampling for each run.
          </p>
          <p className="text-sm">
            Each summarized trace joins the closest existing topic when it is
            similar; otherwise it appears under Outliers. A facet without topics
            gets its first ones once 100 traces from the last seven days are
            summarized. Topics are not refreshed automatically; run{" "}
            <em>Regenerate topics</em> to refresh them.
          </p>
          {paused ? (
            <Alert variant="warning">
              <Alert.Title>Paused: {paused.shortLabel}</Alert.Title>
              <Alert.Description>
                <p className="break-words">{paused.message}</p>
              </Alert.Description>
            </Alert>
          ) : null}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-bold">Models</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {TOPICS_MODEL_SLOTS.map((slot) => (
                <ModelRow
                  key={slot}
                  label={TOPICS_MODEL_SLOT_DETAILS[slot].label}
                  model={models[slot]}
                />
              ))}
            </dl>
            <p className="text-muted-foreground text-xs">
              {modelsHint(paused !== null, missingModel)}
            </p>
          </section>
          <RuleSamplingSection
            store={samplingStore}
            description="The share of new traces Topics summarizes automatically."
            tooltip="Topics summarizes this share of new traces. A lower rate costs less. For manual processing, you set the sampling for each run."
          />
          <TopicAutomaticTraceScope
            projectId={projectId}
            filters={filters}
            onFiltersChange={setFilters}
          />
          <SwitchInput
            id="topics-automatic-processing"
            aria-label="Automatic processing"
            description={`Summarize new traces automatically. ${COST_NOTE}`}
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

function ModelRow({ label, model }: { label: string; model: string | null }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      {model ? (
        <dd className="truncate" title={model}>
          {model}
        </dd>
      ) : (
        <dd className="text-destructive">Not set</dd>
      )}
    </>
  );
}

function modelsHint(paused: boolean, missingModel: boolean) {
  if (missingModel)
    return "Choose every model in Configure Topics before turning this on.";
  return paused
    ? "Turning this back on tests each model with one call."
    : "Change models in Configure Topics.";
}

function idleTimeLabel(traceIdleMs: number) {
  const seconds = Math.round(traceIdleMs / 1000);
  if (seconds % 60 !== 0) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
