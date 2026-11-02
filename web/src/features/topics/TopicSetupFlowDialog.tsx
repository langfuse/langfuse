import { Slider } from "@/src/components/ui/Slider";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  ArrowUpRight,
  Copy,
  Lock,
  Plug,
  RefreshCw,
} from "@langfuse/icons";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
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
import { TopicTraceFilterSection } from "./TopicTraceFilterSection";

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
  | { status: "ready"; matched: number; days: number; dailyTraces: number }
  | { status: "error"; message: string };

export type TopicSetupFlowDialogProps = {
  advancedOpen: boolean;
  busy: boolean;
  canWrite: boolean;
  clustering: JudgeModel | null;
  connectionCaption: string;
  /** False when the project has no AI connection yet; models cannot be picked. */
  hasConnection: boolean;
  /** Whether this user may add an AI connection; others are asked to contact an admin. */
  canAddConnection: boolean;
  embedding: JudgeModel | null;
  embeddingProviderGroups: Array<[string, string[]]>;
  error: string | null;
  onAdvancedOpenChange: (open: boolean) => void;
  onBack: () => void;
  onClusteringChange: (model: JudgeModel) => void;
  onConfigureProviders: () => void;
  /** Absolute link to the project's LLM connection settings, shared by non-admins. */
  connectionSettingsUrl: string;
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
  hasConnection,
  canAddConnection,
  embedding,
  embeddingProviderGroups,
  error,
  onAdvancedOpenChange,
  onBack,
  onClusteringChange,
  onConfigureProviders,
  connectionSettingsUrl,
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
  // The server picks its own traces, so a failed estimate must not block Start.
  const canStart = canWrite && !busy && pastCount.status !== "loading";
  // Without a connection, people who cannot add one only get a link to share and Close.
  const viewerBlocked = !hasConnection && !canAddConnection;
  // Without a connection Next stays clickable and opens the connection settings instead.
  const needsConnection = step === "questions" && !hasConnection;
  const nextDisabled = needsConnection
    ? false
    : nextStepDisabled({
        step,
        busy,
        canWrite,
        canLeaveQuestions,
        canStart,
      });
  const notice =
    pastCount.status === "ready" ? backfillNotice(pastCount.matched) : null;

  return (
    <Dialog
      title={`${STEP_TITLES[step]} · ${STEP_NUMBERS[step]}`}
      {...(viewerBlocked ? { closeLabel: "Close" } : {})}
    >
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
                      className="grid grid-cols-[16px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 px-3 py-2.5 sm:grid-cols-[16px_96px_minmax(0,1fr)]"
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
                      <span className="text-muted-foreground col-start-2 text-sm sm:col-start-auto">
                        {question.description}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 className="text-sm font-bold">
                    Select models for analysis
                  </h2>
                  {hasConnection && (
                    <span className="text-muted-foreground text-xs">
                      {connectionCaption}
                    </span>
                  )}
                </div>
                {viewerBlocked && (
                  <AskAdminForConnection url={connectionSettingsUrl} />
                )}
                {!hasConnection && canAddConnection && (
                  <Alert variant="warning" icon={Plug}>
                    <Alert.Title>
                      No AI connection in this project yet
                    </Alert.Title>
                    <Alert.Description>
                      <div className="mt-2">
                        <Button
                          text="Add connection"
                          variant="secondary"
                          size="sm"
                          icon={ArrowUpRight}
                          onClick={onConfigureProviders}
                        />
                      </div>
                    </Alert.Description>
                  </Alert>
                )}
                {!viewerBlocked && !hasConnection && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none divide-y rounded-lg border text-sm opacity-45"
                  >
                    {MODEL_ROWS.map((row) => (
                      <div
                        key={row.slot}
                        className="grid gap-1 px-3.5 py-2.75 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-3"
                      >
                        <span>{row.label}</span>
                        <span className="text-muted-foreground">
                          No models yet
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {hasConnection && (
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
                )}
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
                  <div className="flex flex-col gap-1.5">
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
                    <p className="text-muted-foreground text-xs">
                      A trace is summarized once no new events arrive for this
                      long, so long-running traces aren&apos;t cut off.
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          {step === "traces" ? (
            <div className="flex flex-col gap-4">
              <TopicTraceFilterSection projectId={projectId} />
              <div className="flex flex-col gap-2">
                <span className="text-sm font-bold">Sample rate</span>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <Slider
                      min={1}
                      max={100}
                      step={1}
                      value={[samplePercent]}
                      aria-label="Sample rate"
                      disabled={!canWrite}
                      onValueChange={(value) =>
                        onSamplePercentChange(value[0] ?? samplePercent)
                      }
                    />
                  </div>
                  <div className="w-20">
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
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {pastCount.status === "ready"
                    ? `~${dailyEstimate(pastCount.dailyTraces, samplePercent)} new traces a day, based on the last ${TOPIC_SETUP_BACKFILL_DAYS} days`
                    : "Share of new traces analyzed once automatic processing is on"}
                </p>
              </div>
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
                    First results from past traces in ~3–5 min
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
        {!viewerBlocked && (
          <div className="flex shrink-0 items-center justify-between border-t px-4 py-3">
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
            <div className="flex items-center gap-3">
              <Button
                text={step === "review" ? "Start analyzing" : "Next"}
                variant="primary"
                loading={busy}
                disabled={nextDisabled}
                onClick={needsConnection ? onConfigureProviders : onNext}
              />
            </div>
          </div>
        )}
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
  if (count.status === "error") return "Could not count past traces";
  if (count.matched === 0)
    return `No past traces in the last ${TOPIC_SETUP_BACKFILL_DAYS} days`;
  const window = count.days === 1 ? "day" : `${count.days} days`;
  return `Include ~${count.matched.toLocaleString("en-US")} past traces from the last ${window}`;
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
    <div className="grid gap-1 px-3 py-2 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center sm:gap-2 sm:py-1.5 sm:pr-1.5">
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
                title={model?.model}
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
    <div className="flex flex-col items-start gap-2 rounded-md border px-3.5 py-3 sm:grid sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex w-full min-w-0 flex-col gap-1.5">
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
              className={
                line.mono
                  ? "min-w-0 truncate font-mono text-xs"
                  : "min-w-0 text-sm break-words"
              }
              title={line.mono ? line.value : undefined}
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

function AskAdminForConnection({ url }: { url: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2.5 text-sm font-bold">
        <Lock size="base" aria-hidden="true" />
        An admin needs to add an AI connection
      </div>
      <p className="text-muted-foreground text-sm">
        You don&apos;t have permission to add one. Share this with an admin:
      </p>
      <div className="bg-muted flex items-center gap-2 rounded-md py-1 pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={url}>
          {url}
        </span>
        <IconButton
          icon={Copy}
          label="Copy link"
          size="sm"
          onClick={() => copyTextToClipboard(url)}
        />
      </div>
    </div>
  );
}
