import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, RefreshCw } from "@langfuse/icons";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { PopoverTrigger } from "@/src/components/ui/popover";
import { JudgeModelPicker } from "@/src/features/evals/v2/components/Evaluators/JudgeModelPicker/JudgeModelPicker";
import { type JudgeModel } from "@/src/features/evals/v2/judgeModel";
import {
  TOPIC_SETUP_BACKFILL_DAYS,
  TOPIC_SETUP_WAIT_MINUTES,
  canLeaveTopicQuestions,
  isRecommendedTopicModel,
  backfillNotice,
  type TopicSetupQuestion,
  type TopicSetupStep,
  type TopicSetupWaitMinutes,
} from "./topic-setup-flow";
import { TopicTraceFilterSection } from "./TopicAutomaticTraceScope";

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

export type TopicSetupPastCount =
  | { status: "loading" }
  | { status: "ready"; matched: number; dailyTraces: number }
  | { status: "error"; message: string };

export type TopicSetupFlowDialogProps = {
  advancedOpen: boolean;
  busy: boolean;
  canWrite: boolean;
  clustering: JudgeModel | null;
  connectionCaption: string;
  embedding: JudgeModel | null;
  embeddingProviderGroups: Array<[string, string[]]>;
  error: string | null;
  onAdvancedOpenChange: (open: boolean) => void;
  onBack: () => void;
  onClusteringChange: (model: JudgeModel) => void;
  onConfigureProviders: () => void;
  onEdit: (step: "questions" | "traces") => void;
  onEmbeddingChange: (model: JudgeModel) => void;
  onNext: () => void;
  onQuestionEnabled: (
    name: TopicSetupQuestion["name"],
    enabled: boolean,
  ) => void;
  onSamplePercentChange: (percent: number) => void;
  onSummaryChange: (model: JudgeModel) => void;
  onWaitMinutesChange: (minutes: TopicSetupWaitMinutes) => void;
  pastCount: TopicSetupPastCount;
  projectId?: string;
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
  onAdvancedOpenChange,
  onBack,
  onClusteringChange,
  onConfigureProviders,
  onEdit,
  onEmbeddingChange,
  onNext,
  onQuestionEnabled,
  onSamplePercentChange,
  onSummaryChange,
  onWaitMinutesChange,
  pastCount,
  projectId,
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
  const canStart = canWrite && !busy && pastCount.status === "ready";
  const nextDisabled = nextStepDisabled({
    step,
    busy,
    canWrite,
    canLeaveQuestions,
    canStart,
  });
  const notice =
    pastCount.status === "ready" ? backfillNotice(pastCount.matched) : null;

  return (
    <Dialog title={`${STEP_TITLES[step]} · ${STEP_NUMBERS[step]}`}>
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
                      className="grid grid-cols-[16px_96px_minmax(0,1fr)] items-center gap-2.5 px-3 py-2.5"
                    >
                      <Checkbox
                        checked={question.enabled}
                        disabled={!canWrite}
                        aria-label={question.name}
                        onCheckedChange={(checked) =>
                          onQuestionEnabled(question.name, checked === true)
                        }
                      />
                      <span className="text-sm font-bold">{question.name}</span>
                      <span className="text-muted-foreground text-sm">
                        {question.description}
                      </span>
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
                {error ? (
                  <p className="text-destructive text-sm">{error}</p>
                ) : null}
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
              <TopicTraceFilterSection
                projectId={projectId}
                description="Custom trace filters are coming soon. For now, the sample rate applies to all new traces."
              />
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
                {pastCount.status === "ready"
                  ? `About ${dailyEstimate(pastCount.dailyTraces, samplePercent)} new traces a day, based on the last ${TOPIC_SETUP_BACKFILL_DAYS} days.`
                  : "Share of new traces analyzed once automatic processing is on."}
              </p>
            </div>
          ) : null}
          {step === "review" ? (
            <div className="flex flex-col gap-2.5">
              <ReviewRow
                label="Look for"
                onEdit={() => onEdit("questions")}
                lines={[
                  {
                    value: questions
                      .filter((question) => question.enabled)
                      .map((question) => question.name)
                      .join(" · "),
                  },
                ]}
              />
              <ReviewRow
                label="Models"
                onEdit={() => onEdit("questions")}
                lines={[
                  {
                    key: "Summaries",
                    value: summary?.model ?? "—",
                    mono: true,
                  },
                  {
                    key: "Embeddings",
                    value: embedding?.model ?? "—",
                    mono: true,
                  },
                  {
                    key: "Grouping",
                    value: clustering?.model ?? "—",
                    mono: true,
                  },
                ]}
              />
              <ReviewRow
                label="Traces"
                onEdit={() => onEdit("traces")}
                lines={[
                  {
                    value:
                      pastCount.status === "ready"
                        ? `${samplePercent}% sampling rate · ~${dailyEstimate(pastCount.dailyTraces, samplePercent)} new / day`
                        : `${samplePercent}% sampling rate`,
                  },
                  { value: backfillLine(pastCount) },
                ]}
              />
              {notice ? (
                <Alert variant="warning" size="sm">
                  <Alert.Description>
                    <p>{notice}</p>
                  </Alert.Description>
                </Alert>
              ) : null}
              <div className="bg-light-blue text-dark-blue mt-1 flex flex-col gap-1.5 rounded-md px-4 py-2.5 text-sm">
                {pastCount.status !== "ready" || pastCount.matched > 0 ? (
                  <span className="flex items-center gap-2">
                    <Clock size="base" aria-hidden="true" />
                    First results from past traces in about 3–5 min
                  </span>
                ) : null}
                <span className="flex items-center gap-2">
                  <RefreshCw size="base" aria-hidden="true" />
                  New traces show up {waitMinutes} min after their last activity
                </span>
              </div>
            </div>
          ) : null}
          {step !== "questions" && error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : null}
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

function dailyEstimate(dailyTraces: number, samplePercent: number) {
  const perDay = (dailyTraces * samplePercent) / 100;
  if (perDay > 0 && perDay < 1) return "<1";
  return Math.round(perDay).toLocaleString("en-US");
}

function backfillLine(count: TopicSetupPastCount) {
  if (count.status === "loading") return "Counting past traces…";
  if (count.status === "error") return count.message;
  if (count.matched === 0)
    return `No past traces in the last ${TOPIC_SETUP_BACKFILL_DAYS} days`;
  return `Include about ${count.matched.toLocaleString("en-US")} past traces from the last ${TOPIC_SETUP_BACKFILL_DAYS} days`;
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
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-2 py-1.5 pr-1.5 pl-3">
      <span className="text-sm">{label}</span>
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
          <button
            type="button"
            disabled={disabled}
            aria-label={`${label} model`}
            title={model ? `${model.provider} / ${model.model}` : undefined}
            className="hover:bg-muted data-[state=open]:bg-muted flex h-8 min-w-0 items-center justify-between gap-2 rounded-md px-2.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={
                  model
                    ? "truncate font-mono text-xs"
                    : "text-muted-foreground truncate text-sm"
                }
              >
                {model?.model ?? "Select a model"}
              </span>
              {recommended ? (
                <Badge text="Recommended" color="green" size="sm" />
              ) : null}
            </span>
            <ChevronDown
              size="base"
              __rawClassName="text-muted-foreground shrink-0"
            />
          </button>
        </PopoverTrigger>
      </JudgeModelPicker>
    </div>
  );
}

function ReviewRow({
  label,
  lines,
  onEdit,
}: {
  label: string;
  lines: Array<{ key?: string; value: string; mono?: boolean }>;
  onEdit: () => void;
}) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3.5 py-3">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex min-w-0 flex-col gap-1.5">
        {lines.map((line) => (
          <div
            key={`${line.key ?? ""}${line.value}`}
            className="flex min-w-0 items-baseline gap-1.5"
          >
            {line.key ? (
              <span className="text-muted-foreground shrink-0 text-xs">
                {line.key}
              </span>
            ) : null}
            <span
              className={line.mono ? "truncate font-mono text-xs" : "text-sm"}
              title={line.value}
            >
              {line.value}
            </span>
          </div>
        ))}
      </div>
      <Button text="Edit" variant="ghost" size="sm" onClick={onEdit} />
    </div>
  );
}
