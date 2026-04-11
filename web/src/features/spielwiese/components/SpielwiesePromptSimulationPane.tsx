import { ChevronRight, History, Play, UserRound } from "lucide-react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";
import { Button } from "../ui/button";
import { SpielwieseHeaderStripTag } from "./SpielwieseHeaderStrip";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";
import { getModelTintClassName } from "./spielwieseModelTint";

function getNodeModelLabel(node: SpielwieseAgentNodeVM) {
  return node.settings.find((setting) => setting.id === "model")?.value;
}

function nodeHasUserSection(node: SpielwieseAgentNodeVM) {
  return node.promptSections.some(
    (section) => getMessageKind(section.id) === "user",
  );
}

const playgroundActionButtonClassName =
  "text-foreground/62 hover:text-foreground inline-flex h-6 items-center gap-1.25 rounded-[8px] bg-[#F7F7F7] py-0 pr-2 pl-1.5 text-[11px] font-medium ring-1 ring-black/5 hover:bg-[#F4F4F4]";

function PlaygroundFlowUserIcon({
  toneClassNames,
}: {
  toneClassNames: ReturnType<typeof getMessageToneClassNames>;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border shadow-none ${toneClassNames.chip}`}
      data-testid="spielwiese-playground-flow-user-icon"
    >
      <UserRound className={`size-3 shrink-0 ${toneClassNames.label}`} />
    </span>
  );
}

function PlaygroundFlowAgentSurface({
  modelLabel,
  title,
}: {
  modelLabel?: string;
  title: string;
}) {
  const resolvedModelLabel = modelLabel ?? "Unknown model";

  return (
    <div
      className={`${getModelTintClassName(
        modelLabel,
      )} text-foreground inline-flex h-7 min-w-[15rem] items-center overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-black/4`}
      data-testid="spielwiese-playground-flow-title-surface"
    >
      <div
        className="flex min-w-0 shrink-0 items-center pr-1"
        data-testid="spielwiese-playground-flow-model-segment"
      >
        <span className="inline-flex min-w-0 items-center">
          <SpielwieseHeaderStripTag
            className="bg-transparent"
            label=""
            revealLabelWidthClassName="max-w-0"
            revealWidthClassName="w-6"
          >
            <SpielwieseModelProviderMark currentModel={modelLabel} />
          </SpielwieseHeaderStripTag>
          <span className="max-w-[8.5rem] min-w-0 truncate px-2.5 text-[13px] font-medium whitespace-nowrap">
            {resolvedModelLabel}
          </span>
        </span>
      </div>
      <div className="w-px shrink-0 self-stretch bg-black/8" />
      <span className="min-w-0 truncate px-2.5 text-[13px] font-semibold tracking-[-0.01em]">
        {title}
      </span>
    </div>
  );
}

function PlaygroundFlowHeaderShell({
  hasUserSection,
  modelLabel,
  title,
}: {
  hasUserSection: boolean;
  modelLabel?: string;
  title: string;
}) {
  const userToneClassNames = getMessageToneClassNames("user");

  return (
    <div
      className="border-border/40 bg-background/96 flex w-full min-w-0 items-center rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border"
      data-testid="spielwiese-playground-flow-node"
    >
      <div
        className="flex w-full min-w-0 items-center gap-1.5 pt-[6px] pr-2.5 pb-[6px] pl-[6px]"
        data-testid="spielwiese-playground-flow-header-row"
      >
        {hasUserSection ? (
          <PlaygroundFlowUserIcon toneClassNames={userToneClassNames} />
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <PlaygroundFlowAgentSurface modelLabel={modelLabel} title={title} />
        </div>
      </div>
    </div>
  );
}

function PlaygroundFlowNode({
  isLast,
  node,
}: {
  isLast: boolean;
  node: SpielwieseAgentNodeVM;
}) {
  const modelLabel = getNodeModelLabel(node);
  const hasUserSection = nodeHasUserSection(node);

  return (
    <>
      <div
        className="group flex w-full min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-(--node-shell-radius) border border-[rgba(0,0,0,0.05)] bg-[#FBFBFB] px-[2px] pt-[2px] pb-[2px] [--node-shell-gap:2px] [--node-shell-radius:16px]"
        data-testid="spielwiese-playground-flow-step"
      >
        <PlaygroundFlowHeaderShell
          hasUserSection={hasUserSection}
          modelLabel={modelLabel}
          title={node.title}
        />
      </div>
      {isLast ? null : (
        <ChevronRight
          aria-hidden="true"
          className="text-foreground/28 size-3 shrink-0 stroke-[2.2px]"
          data-testid="spielwiese-playground-flow-chevron"
        />
      )}
    </>
  );
}

function PlaygroundSurface({ nodes }: { nodes: SpielwieseAgentNodeVM[] }) {
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-none bg-[#15181C] p-2"
      data-testid="spielwiese-prompt-simulation-pane"
    >
      <div
        className="bg-background flex min-h-0 flex-1 flex-col items-start gap-3 rounded-[8px] px-4 py-3 shadow-xs"
        data-testid="spielwiese-playground-terminal-shell"
      >
        <div
          className="flex w-full items-center pr-1 pl-[13px]"
          data-testid="spielwiese-playground-header"
        >
          <div
            className="text-foreground/54 text-[0.75rem] font-medium tracking-[0.02em]"
            data-testid="spielwiese-playground-title"
          >
            Playground
          </div>
          <div
            className="ml-auto flex items-center gap-2"
            data-testid="spielwiese-playground-actions"
          >
            <Button
              className={playgroundActionButtonClassName}
              data-testid="spielwiese-playground-history-button"
              size="sm"
              variant="ghost"
            >
              <History aria-hidden="true" className="size-3 shrink-0" />
              <span>History</span>
            </Button>
            <Button
              className={playgroundActionButtonClassName}
              data-testid="spielwiese-playground-play-button"
              size="sm"
              variant="ghost"
            >
              <Play aria-hidden="true" className="size-3 shrink-0" />
              <span>Play</span>
            </Button>
          </div>
        </div>
        <div
          className="flex w-full min-w-0 flex-1 items-start gap-2 overflow-x-auto"
          data-testid="spielwiese-playground-flow-strip"
        >
          {nodes.map((node, index) => (
            <PlaygroundFlowNode
              isLast={index === nodes.length - 1}
              key={node.id}
              node={node}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SpielwiesePromptSimulationPane({
  nodes,
}: {
  nodes: SpielwieseAgentNodeVM[];
}) {
  return <PlaygroundSurface nodes={nodes} />;
}
