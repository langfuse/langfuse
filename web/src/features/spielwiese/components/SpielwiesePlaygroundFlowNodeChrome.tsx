import {
  Bot,
  Calculator,
  MessageSquareText,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import { PlaygroundThinkingCard } from "./SpielwiesePlaygroundThinkingCard";

function getPlaygroundNodeKindIcon(kind: string): LucideIcon {
  switch (kind) {
    case "Classifier":
      return ScanSearch;
    case "Calculator":
      return Calculator;
    case "Responder":
      return MessageSquareText;
    default:
      return Bot;
  }
}

function PlaygroundFlowNodeTag({
  kind,
  title,
}: {
  kind: string;
  title: string;
}) {
  const Icon = getPlaygroundNodeKindIcon(kind);

  return (
    <div
      className="bg-background text-foreground inline-flex h-7 max-w-full min-w-0 shrink-0 items-center overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-black/4"
      data-kind={kind}
      data-testid="spielwiese-playground-flow-node-tag"
    >
      <span
        aria-hidden="true"
        className="flex h-full w-6 shrink-0 items-center justify-center border-r border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.02)]"
      >
        <Icon
          className="text-foreground/70 size-3 shrink-0"
          data-testid="spielwiese-playground-flow-kind-icon"
        />
      </span>
      <span className="min-w-0 truncate px-2.5 text-[13px] font-medium tracking-[-0.01em]">
        {title}
      </span>
    </div>
  );
}

export function PlaygroundFlowNodeHeader({
  isThinkingDetailOpen,
  isThinking,
  kind,
  onThinkingCardClick,
  thinkingSummary,
  title,
}: {
  isThinkingDetailOpen: boolean;
  isThinking: boolean;
  kind: string;
  onThinkingCardClick: () => void;
  thinkingSummary: string;
  title: string;
}) {
  return (
    <div
      className="flex w-full min-w-0 items-center gap-1.5 pt-[6px] pr-[6px] pb-[5px] pl-[6px]"
      data-testid="spielwiese-playground-flow-header-row"
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
        data-testid="spielwiese-playground-flow-node-leading"
      >
        <PlaygroundFlowNodeTag kind={kind} title={title} />
      </div>
      <PlaygroundThinkingCard
        isDetailOpen={isThinkingDetailOpen}
        isVisible={isThinking}
        onClick={onThinkingCardClick}
        summary={thinkingSummary}
      />
    </div>
  );
}
