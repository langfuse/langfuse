import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";

const playgroundThinkingCardClassName =
  "relative flex h-7 w-full items-center overflow-hidden rounded-[10px] border border-[rgba(184,139,76,0.12)] bg-[linear-gradient(180deg,rgba(251,249,244,0.98)_0%,rgba(247,244,238,0.98)_100%)] px-1.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] ring-1 ring-[rgba(184,139,76,0.08)]";
const thinkingStatClassName =
  "inline-flex h-5 shrink-0 items-center rounded-[6px] border border-[rgba(0,0,0,0.05)] bg-[rgba(255,255,255,0.74)] px-1.5 text-[10px] font-medium tracking-[-0.01em] text-foreground/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]";
const thinkingTokenClassName =
  "inline-flex h-5 shrink-0 items-center rounded-[6px] border border-[rgba(184,139,76,0.16)] bg-[rgba(255,255,255,0.84)] px-1.5 text-[10px] font-semibold tracking-[-0.01em] text-[#8C5B24] shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]";

type PlaygroundThinkingCardMeta = {
  reasonedLabel: string;
  tokensLabel: string;
  toolCallsLabel: string;
};

function formatThinkingMetricLabel({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return `${label} ${value}`;
}

export function getThinkingCardMeta({
  playgroundThinking,
}: Pick<
  SpielwieseAgentNodeVM,
  "playgroundThinking"
>): PlaygroundThinkingCardMeta {
  const reasonedSteps =
    playgroundThinking?.reasonedSteps ?? playgroundThinking?.steps.length ?? 0;
  const toolCalls = playgroundThinking?.toolCalls ?? 0;
  const thinkingTokens =
    playgroundThinking?.thinkingTokens ?? Math.max(reasonedSteps, 1) * 128;

  return {
    reasonedLabel: formatThinkingMetricLabel({
      label: "Reasoned",
      value: reasonedSteps,
    }),
    tokensLabel: `${new Intl.NumberFormat("en-US").format(thinkingTokens)} tok`,
    toolCallsLabel: formatThinkingMetricLabel({
      label: "Tools",
      value: toolCalls,
    }),
  };
}

export function getThinkingSummary(node: SpielwieseAgentNodeVM) {
  return node.playgroundThinking?.summary ?? "analyzing prompt";
}

function PlaygroundThinkingCardMetrics({
  meta,
}: {
  meta: PlaygroundThinkingCardMeta;
}) {
  return (
    <>
      <span
        className={thinkingStatClassName}
        data-testid="spielwiese-playground-thinking-stat-tools"
      >
        {meta.toolCallsLabel}
      </span>
      <span
        className={thinkingStatClassName}
        data-testid="spielwiese-playground-thinking-stat-reasoned"
      >
        {meta.reasonedLabel}
      </span>
      <span
        className={cn("ml-auto", thinkingTokenClassName)}
        data-testid="spielwiese-playground-thinking-stat-tokens"
      >
        {meta.tokensLabel}
      </span>
    </>
  );
}

function PlaygroundThinkingCardSummary({ summary }: { summary: string }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      <div
        aria-hidden="true"
        className="flex shrink-0 items-center gap-1"
        data-testid="spielwiese-playground-thinking-card-dots"
      >
        <span className="size-1.5 animate-pulse rounded-full bg-[rgba(201,120,62,0.78)]" />
        <span className="size-1.5 animate-pulse rounded-full bg-[rgba(201,120,62,0.58)] [animation-delay:140ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-[rgba(201,120,62,0.42)] [animation-delay:280ms]" />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <span className="text-foreground shrink-0 text-[12px] font-semibold tracking-[-0.01em]">
          Thinking
        </span>
        <span className="text-foreground/42 truncate text-[11px] font-medium">
          {summary}
        </span>
      </div>
    </div>
  );
}

export function PlaygroundThinkingCard({
  isDetailOpen,
  isVisible,
  meta,
  onClick,
  summary,
}: {
  isDetailOpen: boolean;
  isVisible: boolean;
  meta: PlaygroundThinkingCardMeta;
  onClick: () => void;
  summary: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden transition-[max-width,opacity,transform,margin] duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
        isVisible
          ? "ml-1.5 max-w-none flex-1 translate-x-0 opacity-100"
          : "pointer-events-none ml-0 max-w-0 translate-x-1 opacity-0",
      )}
      data-state={isVisible ? "open" : "closed"}
      data-testid="spielwiese-playground-thinking-card-shell"
    >
      <button
        aria-expanded={isDetailOpen}
        aria-label="Open thinking process"
        className={playgroundThinkingCardClassName}
        data-testid="spielwiese-playground-thinking-card"
        type="button"
        onClick={onClick}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-[rainbow_2.8s_linear_infinite] bg-[linear-gradient(90deg,rgba(201,120,62,0.02)_0%,rgba(201,120,62,0.16)_42%,rgba(255,255,255,0.02)_68%,rgba(201,120,62,0.1)_100%)] bg-[length:220%_100%]"
          data-testid="spielwiese-playground-thinking-card-glow"
        />
        <div className="relative flex w-full min-w-0 items-center gap-1.5">
          <PlaygroundThinkingCardSummary summary={summary} />
          <PlaygroundThinkingCardMetrics meta={meta} />
        </div>
      </button>
    </div>
  );
}

export function PlaygroundThinkingDetailCard({
  thinking,
}: {
  thinking: NonNullable<SpielwieseAgentNodeVM["playgroundThinking"]>;
}) {
  return (
    <div
      className="mx-2.5 rounded-xl border border-[rgba(201,120,62,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,244,239,0.98)_100%)] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] ring-1 ring-[rgba(201,120,62,0.06)]"
      data-testid="spielwiese-playground-thinking-detail"
    >
      <div className="flex flex-col gap-1">
        <div className="text-foreground text-[12px] font-semibold tracking-[-0.01em]">
          {thinking.title}
        </div>
        <div className="text-foreground/54 text-[11px] leading-4">
          Live reasoning snapshot for this agent run.
        </div>
      </div>
      <ol className="mt-3 flex flex-col gap-2">
        {thinking.steps.map((step) => (
          <li
            className="flex flex-col gap-0.5 rounded-[10px] bg-[rgba(255,255,255,0.72)] px-2.5 py-2"
            key={step.id}
          >
            <div className="text-foreground text-[12px] font-medium">
              {step.label}
            </div>
            <div className="text-foreground/62 text-[11px] leading-4">
              {step.value}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
