import { useState, type ReactElement } from "react";
import { ChevronDown, ChevronRight } from "@langfuse/icons";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { PopoverTrigger } from "@/src/components/ui/popover";
import {
  JudgeModelPicker,
  JudgeModelPickerTrigger,
} from "@/src/features/evals/v2/components/Evaluators/JudgeModelPicker/JudgeModelPicker";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";
import {
  TOPIC_SETUP_PAST_RANGES,
  TOPIC_SETUP_WAIT_MINUTES,
  canLeaveTopicQuestions,
  firstTopicsEstimate,
  isRecommendedTopicModel,
  pastBatchLimit,
  pastBatchNotice,
  type TopicSetupPastDays,
  type TopicSetupQuestion,
  type TopicSetupStep,
  type TopicSetupWaitMinutes,
} from "./topic-setup-flow";

const STEP_TITLES: Record<TopicSetupStep, string> = {
  questions: "Set up topics",
  traces: "Select traces to analyze",
  review: "Review",
};

const STEP_NUMBERS: Record<TopicSetupStep, string> = {
  questions: "1 / 3",
  traces: "2 / 3",
  review: "3 / 3",
};

const MODEL_ROWS = [
  { slot: "summary", label: "Summaries" },
  { slot: "embedding", label: "Embeddings" },
  { slot: "clustering", label: "Grouping" },
] as const;

export type TopicSetupPastCount = {
  status: "hidden" | "loading" | "ready" | "error";
  matched: number | null;
  message?: string;
};

export type TopicSetupFlowDialogProps = {
  advancedOpen: boolean;
  busy: boolean;
  canWrite: boolean;
  clustering: JudgeModel | null;
  connectionCaption: string;
  embedding: JudgeModel | null;
  embeddingProviderGroups: Array<[string, string[]]>;
  error: string | null;
  renderFilter: (() => unknown) | null;
  onAdvancedOpenChange: (open: boolean) => void;
  onBack: () => void;
  onClusteringChange: (model: JudgeModel) => void;
  onConfigureProviders: () => void;
  onEdit: (step: "questions" | "traces") => void;
  onEmbeddingChange: (model: JudgeModel) => void;
  onNext: () => void;
  onPastDaysChange: (days: TopicSetupPastDays) => void;
  onPastOnChange: (on: boolean) => void;
  onQuestionEnabled: (
    name: TopicSetupQuestion["name"],
    enabled: boolean,
  ) => void;
  onSamplePercentChange: (percent: number) => void;
  onSummaryChange: (model: JudgeModel) => void;
  onWaitMinutesChange: (minutes: TopicSetupWaitMinutes) => void;
  pastCount: TopicSetupPastCount;
  pastDays: TopicSetupPastDays;
  pastOn: boolean;
  providerGroups: Array<[string, string[]]>;
  questions: TopicSetupQuestion[];
  samplePercent: number;
  step: TopicSetupStep;
  summary: JudgeModel | null;
  waitMinutes: TopicSetupWaitMinutes;
};

export function TopicSetupFlowDialog({
  advancedOpen,
  busy,
  canWrite,
  clustering,
  connectionCaption,
  embedding,
  embeddingProviderGroups,
  error,
  renderFilter,
  onAdvancedOpenChange,
  onBack,
  onClusteringChange,
  onConfigureProviders,
  onEdit,
  onEmbeddingChange,
  onNext,
  onPastDaysChange,
  onPastOnChange,
  onQuestionEnabled,
  onSamplePercentChange,
  onSummaryChange,
  onWaitMinutesChange,
  pastCount,
  pastDays,
  pastOn,
  providerGroups,
  questions,
  samplePercent,
  step,
  summary,
  waitMinutes,
}: TopicSetupFlowDialogProps) {
  const models = { summary, embedding, clustering };
  const onModelChange = {
    summary: onSummaryChange,
    embedding: onEmbeddingChange,
    clustering: onClusteringChange,
  };
  const groups = {
    summary: providerGroups,
    embedding: embeddingProviderGroups,
    clustering: providerGroups,
  };
  const canLeaveQuestions = canLeaveTopicQuestions({
    canWrite,
    questions,
    summary,
    embedding,
    clustering,
  });
  const pastReady = pastCount.status === "ready" ? pastCount.matched : null;
  const runCount =
    pastReady !== null ? pastBatchLimit(pastReady, samplePercent) : null;
  const canStart =
    canWrite &&
    !busy &&
    (!pastOn ||
      (pastReady !== null && pastBatchLimit(pastReady, samplePercent) > 0));
  const nextDisabled = nextStepDisabled({
    step,
    busy,
    canWrite,
    canLeaveQuestions,
    canStart,
  });
  const notice =
    pastOn && pastReady !== null
      ? pastBatchNotice(pastReady, samplePercent)
      : null;

  return (
    <Dialog title={`${STEP_TITLES[step]} · ${STEP_NUMBERS[step]}`} size="lg">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          {step === "questions" ? (
            <>
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-bold">What to look for</h2>
                <div className="divide-y rounded-md border">
                  {questions.map((question) => (
                    <div
                      key={question.name}
                      className="flex items-start gap-2.5 px-3 py-2.5"
                    >
                      <Checkbox
                        checked={question.enabled}
                        disabled={!canWrite}
                        aria-label={question.name}
                        onCheckedChange={(checked) =>
                          onQuestionEnabled(question.name, checked === true)
                        }
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold">{question.name}</div>
                        <p className="text-muted-foreground text-sm">
                          {question.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-bold">
                    Select models for analysis
                  </h2>
                  <span className="text-muted-foreground text-xs">
                    {connectionCaption}
                  </span>
                </div>
                <div className="divide-y rounded-md border">
                  {MODEL_ROWS.map((row) => {
                    const model = models[row.slot];
                    return (
                      <ModelRow
                        key={row.slot}
                        label={row.label}
                        model={model}
                        recommended={
                          model
                            ? isRecommendedTopicModel(row.slot, model.model)
                            : false
                        }
                        disabled={!canWrite}
                        providerGroups={groups[row.slot]}
                        onConfigureProviders={onConfigureProviders}
                        onSelect={onModelChange[row.slot]}
                      />
                    );
                  })}
                </div>
              </section>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className="flex w-fit items-center gap-1 text-sm font-bold"
                  aria-expanded={advancedOpen}
                  onClick={() => onAdvancedOpenChange(!advancedOpen)}
                >
                  Advanced
                  {advancedOpen ? (
                    <ChevronDown size="base" />
                  ) : (
                    <ChevronRight size="base" />
                  )}
                </button>
                {advancedOpen ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm">Wait before summarizing</span>
                    <div className="flex gap-1.5">
                      {TOPIC_SETUP_WAIT_MINUTES.map((minutes) => {
                        const selected = waitMinutes === minutes;
                        return (
                          <button
                            key={minutes}
                            type="button"
                            className={
                              selected
                                ? "bg-primary text-primary-foreground border-primary rounded-full border px-3 py-1 text-sm"
                                : "rounded-full border px-3 py-1 text-sm"
                            }
                            aria-pressed={selected}
                            onClick={() => onWaitMinutesChange(minutes)}
                          >
                            {minutes} min
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          {step === "traces" ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-3">
                <span className="text-sm font-bold">Sample rate</span>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={samplePercent}
                    aria-label="Sample rate"
                    className="accent-primary w-40"
                    disabled={!canWrite}
                    onChange={(event) =>
                      onSamplePercentChange(Number(event.target.value))
                    }
                  />
                  <div className="w-28">
                    <Input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      aria-label="Sample rate percent"
                      value={String(samplePercent)}
                      disabled={!canWrite}
                      onChange={(event) => {
                        const percent = samplePercentFromInput(
                          event.target.value,
                        );
                        if (percent !== null) onSamplePercentChange(percent);
                      }}
                    />
                  </div>
                  <span className="text-sm">%</span>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                Saved for automatic processing. Starting analysis turns it on.
                The past-trace batch includes at most 1,000 traces.
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <Checkbox
                  checked={pastOn}
                  disabled={!canWrite}
                  aria-label="Include past traces"
                  onCheckedChange={(checked) =>
                    onPastOnChange(checked === true)
                  }
                />
                <span className="text-sm font-bold">Include past traces</span>
                {pastOn ? (
                  <div className="w-44">
                    <SelectInput
                      aria-label="Past trace range"
                      placeholder="Past range"
                      value={String(pastDays)}
                      options={TOPIC_SETUP_PAST_RANGES.map((range) => ({
                        value: String(range.days),
                        label: range.label,
                      }))}
                      onValueChange={(value) =>
                        onPastDaysChange(Number(value) as TopicSetupPastDays)
                      }
                    />
                  </div>
                ) : null}
                {pastCount.status === "ready" && runCount !== null ? (
                  <span className="text-muted-foreground ml-auto text-xs">
                    {runCount.toLocaleString("en-US")} traces
                  </span>
                ) : null}
                {pastCount.status === "loading" ? (
                  <span className="text-muted-foreground ml-auto text-xs">
                    Counting traces…
                  </span>
                ) : null}
                {pastCount.status === "error" ? (
                  <span className="text-destructive ml-auto text-xs">
                    {pastCount.message ?? "Could not count traces."}
                  </span>
                ) : null}
              </div>
              {pastOn ? (
                <div className="flex flex-col gap-2">
                  <p className="text-muted-foreground text-xs">
                    This filter applies to the past-trace batch only. New traces
                    are not filtered.
                  </p>
                  {renderFilter?.() as ReactElement | null}
                </div>
              ) : null}
              {notice?.kind === "small" ? (
                <Alert variant="warning" size="sm">
                  <Alert.Description>
                    <p>{notice.message}</p>
                  </Alert.Description>
                </Alert>
              ) : null}
              {notice?.kind === "capped" ? (
                <p className="text-muted-foreground text-xs">
                  {notice.message}
                </p>
              ) : null}
            </div>
          ) : null}
          {step === "review" ? (
            <div className="flex flex-col gap-2.5">
              <ReviewRow
                label="Look for"
                onEdit={() => onEdit("questions")}
                lines={[
                  questions
                    .filter((question) => question.enabled)
                    .map((question) => question.name)
                    .join(" · "),
                ]}
              />
              <ReviewRow
                label="Models"
                onEdit={() => onEdit("questions")}
                lines={[
                  summary ? `Summaries ${summary.model}` : "Summaries",
                  embedding ? `Embeddings ${embedding.model}` : "Embeddings",
                  clustering ? `Grouping ${clustering.model}` : "Grouping",
                ]}
                mono
              />
              <ReviewRow
                label="Traces"
                onEdit={() => onEdit("traces")}
                lines={[
                  `${samplePercent}% sample rate`,
                  pastOn
                    ? (TOPIC_SETUP_PAST_RANGES.find(
                        (range) => range.days === pastDays,
                      )?.label ?? "Include past traces")
                    : "New traces only",
                ]}
              />
              <Alert variant="info" size="sm">
                <Alert.Description>
                  <p>{firstTopicsEstimate(waitMinutes)}</p>
                </Alert.Description>
              </Alert>
            </div>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3">
          {step === "questions" ? (
            <span />
          ) : (
            <Button
              text="Back"
              variant="ghost"
              disabled={busy}
              onClick={onBack}
            />
          )}
          <Button
            text={step === "review" ? "Start analyzing" : "Next"}
            variant="primary"
            loading={busy}
            disabled={nextDisabled}
            onClick={onNext}
          />
        </div>
      </div>
    </Dialog>
  );
}

function samplePercentFromInput(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const percent = Number(value);
  if (percent < 1 || percent > 100) return null;
  return percent;
}

function nextStepDisabled({
  busy,
  canLeaveQuestions,
  canStart,
  canWrite,
  step,
}: {
  step: TopicSetupStep;
  busy: boolean;
  canWrite: boolean;
  canLeaveQuestions: boolean;
  canStart: boolean;
}) {
  if (step === "questions") return busy || !canLeaveQuestions;
  if (step === "review") return !canStart;
  return busy || !canWrite;
}

function ModelRow({
  disabled,
  label,
  model,
  onConfigureProviders,
  onSelect,
  providerGroups,
  recommended,
}: {
  disabled: boolean;
  label: string;
  model: JudgeModel | null;
  onConfigureProviders: () => void;
  onSelect: (model: JudgeModel) => void;
  providerGroups: Array<[string, string[]]>;
  recommended: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-2 px-3 py-1.5">
      <span className="text-sm">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1 [&_button]:w-full">
          <JudgeModelPicker
            purpose="decision"
            open={open && !disabled}
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
                disabled={disabled}
              />
            </PopoverTrigger>
          </JudgeModelPicker>
        </div>
        {recommended ? (
          <Badge text="Recommended" color="green" size="sm" />
        ) : null}
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  lines,
  mono = false,
  onEdit,
}: {
  label: string;
  lines: string[];
  mono?: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3.5 py-3">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex min-w-0 flex-col gap-1">
        {lines.map((line) => (
          <span
            key={line}
            className={mono ? "truncate font-mono text-xs" : "text-sm"}
            title={line}
          >
            {line}
          </span>
        ))}
      </div>
      <Button text="Edit" variant="ghost" size="sm" onClick={onEdit} />
    </div>
  );
}
