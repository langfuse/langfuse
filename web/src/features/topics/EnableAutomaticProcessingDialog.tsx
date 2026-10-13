import { useState } from "react";
import { Info } from "lucide-react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { RuleSamplingSection } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleSamplingSection";
import { createRuleSetupStore } from "@/src/features/evals/v2/stores/createRuleSetupStore";
import {
  TOPICS_MODEL_SLOT_DETAILS,
  TOPICS_MODEL_SLOTS,
  type TopicsModelSlotName,
} from "@langfuse/shared/topics";

type EnableAutomaticProcessingDialogProps = {
  /** `enable` turns processing on; `edit` changes sampling while it is on. */
  mode: "enable" | "edit";
  initialSampling: number;
  traceIdleMs: number;
  models: Record<TopicsModelSlotName, string | null>;
  paused: { shortLabel: string; message: string } | null;
  saving: boolean;
  error: string | null;
  onSubmit: (sampling: number) => void;
};

/** Dialog content; render it inside a Radix `Dialog.Root`. */
export function EnableAutomaticProcessingDialog({
  error,
  initialSampling,
  mode,
  models,
  onSubmit,
  paused,
  saving,
  traceIdleMs,
}: EnableAutomaticProcessingDialogProps) {
  const [samplingStore] = useState(() =>
    createRuleSetupStore({
      name: "",
      filter: [],
      sampling: initialSampling,
      assignments: [],
    }),
  );
  const missingModel = TOPICS_MODEL_SLOTS.some((slot) => !models[slot]);
  return (
    <Dialog
      title={dialogTitle(mode, paused !== null)}
      actions={[
        {
          label: mode === "enable" ? "Turn on" : "Save sampling",
          loading: saving,
          disabled: saving || (mode === "enable" && missingModel),
          onClick: () => onSubmit(samplingStore.getState().sampling),
        },
      ]}
    >
      <Dialog.Body>
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            New traces are summarized with your saved facets and models once
            they have been idle for {idleTimeLabel(traceIdleMs)}. Backfills and
            manual runs do not need this and are not sampled.
          </p>
          {paused ? (
            <Alert variant="warning">
              <Alert.Title>Paused: {paused.shortLabel}</Alert.Title>
              <Alert.Description>
                <p className="break-words">{paused.message}</p>
              </Alert.Description>
            </Alert>
          ) : null}
          <Alert variant="info" icon={Info}>
            <Alert.Description>
              Only traces from v4-ready ingestion are processed automatically.
              Legacy ingestion is not included.
            </Alert.Description>
          </Alert>
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
              {modelsHint(mode, missingModel)}
            </p>
          </section>
          <RuleSamplingSection
            store={samplingStore}
            description="The share of new traces Topics summarizes automatically."
            tooltip="Topics summarizes this share of new traces. A lower rate costs less. Backfills and manual runs always process every trace they select."
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

function dialogTitle(mode: "enable" | "edit", paused: boolean) {
  if (mode === "edit") return "Automatic processing sampling";
  return paused
    ? "Turn automatic processing back on"
    : "Enable automatic processing";
}

function modelsHint(mode: "enable" | "edit", missingModel: boolean) {
  if (missingModel)
    return "Choose every model in Configure Topics before turning this on.";
  return mode === "enable"
    ? "Turning this on tests each model with one call."
    : "Change models in Configure Topics.";
}

function idleTimeLabel(traceIdleMs: number) {
  const seconds = Math.round(traceIdleMs / 1000);
  if (seconds % 60 !== 0) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
