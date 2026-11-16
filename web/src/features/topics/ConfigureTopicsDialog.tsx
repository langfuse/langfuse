/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { useId, useState, type ReactNode } from "react";
import { AlertTriangle, ExternalLinkIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { Button as LegacyButton } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  JudgeModelPicker,
  JudgeModelPickerTrigger,
} from "@/src/features/evals/v2/components/Evaluators/JudgeModelPicker/JudgeModelPicker";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";

export type TopicSlotCheck = {
  status: "idle" | "testing" | "ok" | "error";
  message?: string;
};

export type ConfigureTopicsSaveDraft = {
  summary: JudgeModel | null;
  embedding: JudgeModel | null;
  embeddingDimensions: string;
  clustering: JudgeModel | null;
  idleSeconds: string;
};

export type ConfigureTopicsDraft = {
  summary: JudgeModel | null;
  embedding: JudgeModel | null;
  embeddingDimensions: string;
  clustering: JudgeModel | null;
  idleSeconds: string;
  embeddingLocked: boolean;
  /**
   * Automatic processing of new traces is on, so Save tests every model.
   * Otherwise Save tests only the models that changed.
   */
  automaticProcessing: boolean;
};

type ConfigureTopicsDialogProps = {
  providerGroups: Array<[string, string[]]>;
  embeddingProviderGroups?: Array<[string, string[]]>;
  draft: ConfigureTopicsDraft;
  closeDialog: () => void;
  onConfigureProviders: () => void;
  onSave: (draft: ConfigureTopicsSaveDraft) => void | Promise<void>;
  onSlotCommit?: (
    slot: "summary" | "embedding" | "clustering",
    model: JudgeModel,
    dimensions: string,
  ) => void;
  slotChecks?: Partial<
    Record<"summary" | "embedding" | "clustering", TopicSlotCheck>
  >;
  canWrite?: boolean;
  saving?: boolean;
  saveError?: string | null;
  /** Shown only for projects whose automatic analysis is off. */
  automaticProcessingOff?: { onTurnOn: () => void; pending: boolean };
} & (
  | { notice: "none" }
  | {
      notice: "paused";
      shortLabel: string;
      pausedAgo: string;
      message: string;
    }
);

const SLOT_COPY = {
  summary: {
    label: "Facet summaries",
    recommendation:
      "Choose a strong but cost-efficient model, such as GPT-6 Luna or Claude Haiku 5.5. It runs once per trace.",
  },
  embedding: {
    label: "Embeddings",
    lockedHint: "Locked after the first summaries are embedded.",
    recommendation:
      "Choose an embedding model your connection offers, such as text-embedding-3-small.",
  },
  clustering: {
    label: "Topic clustering",
    recommendation:
      "Choose a slightly stronger model, such as GPT-5.6 Terra, GPT-6.1 Sol, or Claude Sonnet. It runs when topics are updated, manually or once or twice a day.",
  },
} as const;

/** Dialog content; render it from a `DialogController`. */
export function ConfigureTopicsDialog(props: ConfigureTopicsDialogProps) {
  const {
    closeDialog,
    draft,
    canWrite = true,
    onConfigureProviders,
    onSave,
    onSlotCommit,
    providerGroups,
    embeddingProviderGroups = providerGroups,
    saveError = null,
    saving = false,
    slotChecks,
    automaticProcessingOff,
  } = props;
  const paused =
    props.notice === "paused"
      ? {
          shortLabel: props.shortLabel,
          pausedAgo: props.pausedAgo,
          message: props.message,
        }
      : null;
  const formId = useId();
  const [summary, setSummary] = useState(draft.summary);
  const [embedding, setEmbedding] = useState(draft.embedding);
  const [dimensions, setDimensions] = useState(draft.embeddingDimensions);
  const [clustering, setClustering] = useState(draft.clustering);
  const [idleSeconds, setIdleSeconds] = useState(draft.idleSeconds);
  const modelsReady = Boolean(summary && embedding && clustering);
  const testsReady =
    !slotChecks ||
    (["summary", "embedding", "clustering"] as const).every(
      (slot) => slotChecks[slot]?.status === "ok",
    );
  const modelsPass = modelsReady && testsReady;
  const selected = { summary, embedding, clustering };
  // With automatic processing off the server tests only changed slots.
  const changedSlotsPass = (["summary", "embedding", "clustering"] as const)
    .filter(
      (slot) =>
        selected[slot] &&
        (!sameModel(selected[slot], draft[slot]) ||
          (slot === "embedding" && dimensions !== draft.embeddingDimensions)),
    )
    .every((slot) => !slotChecks || slotChecks[slot]?.status === "ok");
  const canSave =
    canWrite &&
    !saving &&
    (draft.automaticProcessing ? modelsPass : changedSlotsPass);
  const commitSlot = (
    slot: "summary" | "embedding" | "clustering",
    model: JudgeModel,
    nextDimensions = dimensions,
  ) => {
    onSlotCommit?.(slot, model, nextDimensions);
  };
  return (
    <Dialog
      title="Settings"
      size="lg"
      actions={[
        {
          label: "Save",
          type: "submit",
          form: formId,
          loading: saving,
          disabled: !canSave,
        },
      ]}
    >
      <form
        id={formId}
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          Promise.resolve(
            onSave({
              summary,
              embedding,
              embeddingDimensions: dimensions,
              clustering,
              idleSeconds,
            }),
          )
            .then(closeDialog)
            .catch(() => undefined);
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
          <p className="bg-light-blue text-dark-blue rounded-md px-4 py-2.5 text-sm">
            Applies to every map in this project. Questions and filters live in
            Edit map.
          </p>
          {automaticProcessingOff ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm leading-none font-bold">
                  Automatic analysis
                </h3>
                <p className="text-muted-foreground text-sm">
                  Off for this project.
                </p>
              </div>
              <Button
                text="Turn on"
                size="sm"
                variant="outline"
                loading={automaticProcessingOff.pending}
                onClick={automaticProcessingOff.onTurnOn}
              />
            </div>
          ) : null}
          {paused ? (
            <PausedNotice
              shortLabel={paused.shortLabel}
              pausedAgo={paused.pausedAgo}
              message={paused.message}
              onConfigureProviders={onConfigureProviders}
            />
          ) : null}
          <SettingsSection
            title="Models"
            description="The connections and models used for summaries, embeddings, and clustering."
          >
            <ModelSlot
              name="summary"
              model={summary}
              locked={false}
              disabled={!canWrite}
              check={slotChecks?.summary}
              connectionMissing={paused !== null}
              providerGroups={providerGroups}
              onConfigureProviders={onConfigureProviders}
              onSelect={(model) => {
                setSummary(model);
                commitSlot("summary", model);
              }}
            />
            <ModelSlot
              name="embedding"
              model={embedding}
              locked={draft.embeddingLocked}
              disabled={!canWrite}
              check={slotChecks?.embedding}
              dimensions={dimensions}
              onDimensionsChange={(value) => {
                setDimensions(value);
                if (embedding) commitSlot("embedding", embedding, value);
              }}
              providerGroups={embeddingProviderGroups}
              onConfigureProviders={onConfigureProviders}
              onSelect={(model) => {
                setEmbedding(model);
                commitSlot("embedding", model);
              }}
            />
            <ModelSlot
              name="clustering"
              model={clustering}
              locked={false}
              disabled={!canWrite}
              check={slotChecks?.clustering}
              providerGroups={providerGroups}
              onConfigureProviders={onConfigureProviders}
              onSelect={(model) => {
                setClustering(model);
                commitSlot("clustering", model);
              }}
            />
          </SettingsSection>
          <SettingsSection
            title="Trace readiness"
            description="Set when a trace is ready to be summarized across the project."
          >
            <div className="flex items-center gap-2">
              <div className="w-24 shrink-0">
                <Input
                  aria-label="Seconds to wait after the last observation"
                  type="number"
                  inputMode="numeric"
                  min={60}
                  value={idleSeconds}
                  onChange={(event) => setIdleSeconds(event.target.value)}
                />
              </div>
              <p className="text-muted-foreground text-sm">
                seconds to wait after the last observation before considering
                the trace done and summarizing it.
              </p>
            </div>
          </SettingsSection>
        </div>
        {saveError ? (
          <p className="text-destructive px-4 pb-2 text-sm">{saveError}</p>
        ) : null}
      </form>
    </Dialog>
  );
}

function ModelSlot({
  check,
  connectionMissing = false,
  dimensions,
  disabled = false,
  locked,
  model,
  name,
  onConfigureProviders,
  onDimensionsChange,
  onSelect,
  providerGroups,
}: {
  check?: TopicSlotCheck;
  connectionMissing?: boolean;
  dimensions?: string;
  disabled?: boolean;
  locked: boolean;
  model: JudgeModel | null;
  name: keyof typeof SLOT_COPY;
  onConfigureProviders: () => void;
  onDimensionsChange?: (dimensions: string) => void;
  onSelect: (model: JudgeModel) => void;
  providerGroups: Array<[string, string[]]>;
}) {
  const [open, setOpen] = useState(false);
  const copy = SLOT_COPY[name];
  const inactive = locked || disabled;
  const controls = (
    <>
      <div
        className={`min-w-0 flex-1 [&_button]:w-full ${inactive ? "[&_button]:pointer-events-none" : ""}`}
      >
        <JudgeModelPicker
          purpose="decision"
          open={open && !inactive}
          onOpenChange={setOpen}
          providerGroups={providerGroups}
          selectedModel={model}
          onSelect={onSelect}
          onConfigureProviders={onConfigureProviders}
        >
          <PopoverTrigger asChild>
            <JudgeModelPickerTrigger
              mode={model ? "custom" : "default"}
              selectedModel={model}
              disabled={inactive}
              modelAvailability={connectionMissing ? "missing" : "available"}
            />
          </PopoverTrigger>
        </JudgeModelPicker>
      </div>
      {dimensions !== undefined ? (
        <div
          className={`w-20 shrink-0 ${inactive ? "pointer-events-none" : ""}`}
        >
          <Input
            aria-label="Embedding dimensions"
            type="number"
            inputMode="numeric"
            value={dimensions}
            disabled={inactive}
            onChange={(event) => onDimensionsChange?.(event.target.value)}
          />
        </div>
      ) : null}
    </>
  );
  const fields = (
    <div className="flex min-w-0 flex-1 items-center gap-2">{controls}</div>
  );

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row">
      <p className="flex shrink-0 items-center text-sm font-bold sm:h-8 sm:w-36">
        {copy.label}
      </p>
      <div className="flex w-full min-w-0 flex-1 flex-col gap-1">
        {locked ? (
          <Tooltip>
            <TooltipTrigger asChild>{fields}</TooltipTrigger>
            <TooltipContent side="bottom">
              {"lockedHint" in copy ? copy.lockedHint : null}
            </TooltipContent>
          </Tooltip>
        ) : (
          fields
        )}
        <SlotStatus check={check} recommendation={copy.recommendation} />
      </div>
    </div>
  );
}

// A test status replaces the recommendation, so the field keeps one line below it.
function SlotStatus({
  check,
  recommendation,
}: {
  check?: TopicSlotCheck;
  recommendation: string;
}) {
  if (check?.status === "testing")
    return <p className="text-muted-foreground text-xs">Testing this model…</p>;
  if (check?.status === "error" && check.message)
    return <p className="text-destructive text-xs">{check.message}</p>;
  return <p className="text-muted-foreground text-xs">{recommendation}</p>;
}

function PausedNotice({
  message,
  onConfigureProviders,
  pausedAgo,
  shortLabel,
}: {
  message: string;
  onConfigureProviders: () => void;
  pausedAgo: string;
  shortLabel: string;
}) {
  return (
    <section
      role="alert"
      className="border-light-yellow bg-light-yellow rounded-lg border"
    >
      <div className="flex gap-3 p-4">
        <AlertTriangle size="base" __rawClassName="text-dark-yellow mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 className="text-foreground text-base font-bold">Topics paused</h2>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">{shortLabel}</span>
            <span className="bg-border h-1 w-1 rounded-full" />
            <span>Paused {pausedAgo}</span>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">{message}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Saving here keeps automatic processing paused. Turn it back on from
            the Topics page once the models work.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <LegacyButton
              type="button"
              variant="outline"
              size="sm"
              onClick={onConfigureProviders}
            >
              <ExternalLinkIcon
                size="base"
                color="default"
                __rawClassName="mr-1.5"
              />
              Open LLM connections
            </LegacyButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function sameModel(a: JudgeModel | null, b: JudgeModel | null) {
  return a?.provider === b?.provider && a?.model === b?.model;
}

/** A titled block of the Settings dialog, styled like the scan dialogs' sections. */
function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}
