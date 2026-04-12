/* eslint-disable max-lines-per-function */
import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronRight, History, Play, UserRound } from "lucide-react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";
import { Button } from "../ui/button";
import {
  getThinkingSummary,
  PlaygroundThinkingCard,
  PlaygroundThinkingDetailCard,
} from "./SpielwiesePlaygroundThinkingCard";
import { SpielwieseHeaderStripTag } from "./SpielwieseHeaderStrip";
import {
  getPlaygroundFlowPreview,
  SpielwiesePlaygroundFlowPromptPreview,
} from "./SpielwiesePlaygroundFlowPromptPreview";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";
import {
  spielwieseHeaderButtonAccentClassName,
  spielwieseHeaderButtonBaseClassName,
} from "./spielwieseHeaderButtonStyles";
import { getModelTintClassName } from "./spielwieseModelTint";
import { cn } from "@/src/utils/tailwind";

function getNodeModelLabel(node: SpielwieseAgentNodeVM) {
  return node.settings.find((setting) => setting.id === "model")?.value;
}

function nodeHasUserSection(node: SpielwieseAgentNodeVM) {
  return node.promptSections.some(
    (section) => getMessageKind(section.id) === "user",
  );
}

const playgroundActionButtonClassName = `${spielwieseHeaderButtonBaseClassName} inline-flex h-6 items-center gap-1.25 rounded-[10px] py-0 pr-2 pl-1.5 text-[11px] font-medium`;

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
      )} text-foreground flex h-7 max-w-full min-w-0 items-center overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-black/4`}
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
  isThinkingDetailOpen,
  hasUserSection,
  isThinking,
  modelLabel,
  onThinkingCardClick,
  thinkingSummary,
  title,
}: {
  isThinkingDetailOpen: boolean;
  hasUserSection: boolean;
  isThinking: boolean;
  modelLabel?: string;
  onThinkingCardClick: () => void;
  thinkingSummary: string;
  title: string;
}) {
  const userToneClassNames = getMessageToneClassNames("user");

  return (
    <div
      className="border-border/40 bg-background/96 flex w-full min-w-0 items-center rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border"
      data-testid="spielwiese-playground-flow-node"
    >
      <div
        className="flex w-full min-w-0 items-center pt-[6px] pr-[6px] pb-[6px] pl-[6px]"
        data-testid="spielwiese-playground-flow-header-row"
      >
        {hasUserSection ? (
          <PlaygroundFlowUserIcon toneClassNames={userToneClassNames} />
        ) : null}
        {hasUserSection ? <div className="w-1.5 shrink-0" /> : null}
        <PlaygroundFlowAgentSurface modelLabel={modelLabel} title={title} />
        <PlaygroundThinkingCard
          isDetailOpen={isThinkingDetailOpen}
          isVisible={isThinking}
          onClick={onThinkingCardClick}
          summary={thinkingSummary}
        />
      </div>
    </div>
  );
}

function PlaygroundFlowNode({
  isThinkingDetailOpen,
  isLast,
  isThinking,
  node,
  onThinkingCardClick,
}: {
  isThinkingDetailOpen: boolean;
  isLast: boolean;
  isThinking: boolean;
  node: SpielwieseAgentNodeVM;
  onThinkingCardClick: () => void;
}) {
  const modelLabel = getNodeModelLabel(node);
  const hasUserSection = nodeHasUserSection(node);
  const preview = getPlaygroundFlowPreview(node);
  const thinkingSummary = getThinkingSummary(node);

  return (
    <>
      <div
        className="group flex min-w-full shrink-0 flex-col gap-1.5 overflow-hidden rounded-(--node-shell-radius) border border-[rgba(0,0,0,0.05)] bg-[#FBFBFB] px-[2px] pt-[2px] pb-[2px] [--node-shell-gap:2px] [--node-shell-radius:16px]"
        data-testid="spielwiese-playground-flow-step"
      >
        <PlaygroundFlowHeaderShell
          isThinkingDetailOpen={isThinkingDetailOpen}
          hasUserSection={hasUserSection}
          isThinking={isThinking}
          modelLabel={modelLabel}
          onThinkingCardClick={onThinkingCardClick}
          thinkingSummary={thinkingSummary}
          title={node.title}
        />
        {node.playgroundThinking && isThinkingDetailOpen ? (
          <PlaygroundThinkingDetailCard thinking={node.playgroundThinking} />
        ) : null}
        <SpielwiesePlaygroundFlowPromptPreview preview={preview} />
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

function PlaygroundSurface({
  headerAccessory,
  nodes,
}: {
  headerAccessory?: ReactNode;
  nodes: SpielwieseAgentNodeVM[];
}) {
  const [activeThinkingNodeId, setActiveThinkingNodeId] = useState<
    string | null
  >(null);
  const [expandedThinkingNodeId, setExpandedThinkingNodeId] = useState<
    string | null
  >(null);
  const defaultThinkingNodeId = nodes[0]?.id ?? null;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F3F3F4] px-0 pt-0 pb-0"
      data-testid="spielwiese-prompt-simulation-pane"
    >
      <div
        className="bg-background relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-visible rounded-[8px] px-4 pt-0 pb-[6px] shadow-xs after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-[6px] after:bg-[#F3F3F4] after:content-['']"
        data-testid="spielwiese-playground-terminal-shell"
      >
        <div
          className="sticky top-0 z-10 -mx-4 flex w-[calc(100%+2rem)] items-center gap-3 rounded-t-[8px] border-b border-black/5 bg-[rgba(251,251,251,0.82)] pt-3 pr-3 pb-3 pl-[13px] supports-[backdrop-filter]:bg-[rgba(251,251,251,0.72)] supports-[backdrop-filter]:backdrop-blur-md"
          data-testid="spielwiese-playground-header"
        >
          {headerAccessory ? (
            <div data-testid="spielwiese-playground-header-accessory">
              {headerAccessory}
            </div>
          ) : null}
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
              aria-pressed={activeThinkingNodeId === defaultThinkingNodeId}
              className={cn(
                playgroundActionButtonClassName,
                activeThinkingNodeId === defaultThinkingNodeId &&
                  spielwieseHeaderButtonAccentClassName,
              )}
              data-testid="spielwiese-playground-play-button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setActiveThinkingNodeId((currentValue) => {
                  const nextThinkingNodeId =
                    currentValue === defaultThinkingNodeId
                      ? null
                      : defaultThinkingNodeId;

                  setExpandedThinkingNodeId((currentExpandedNodeId) =>
                    nextThinkingNodeId ? currentExpandedNodeId : null,
                  );

                  return nextThinkingNodeId;
                })
              }
            >
              <Play aria-hidden="true" className="size-3 shrink-0" />
              <span>Play</span>
            </Button>
          </div>
        </div>
        <div
          className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto pt-3 pb-3"
          data-testid="spielwiese-playground-flow-scroller"
        >
          <div
            className="inline-flex min-w-full items-start gap-2"
            data-testid="spielwiese-playground-flow-strip"
          >
            {nodes.map((node, index) => (
              <PlaygroundFlowNode
                isThinkingDetailOpen={expandedThinkingNodeId === node.id}
                isLast={index === nodes.length - 1}
                isThinking={activeThinkingNodeId === node.id}
                key={node.id}
                node={node}
                onThinkingCardClick={() =>
                  setExpandedThinkingNodeId((currentExpandedNodeId) =>
                    currentExpandedNodeId === node.id ? null : node.id,
                  )
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SpielwiesePromptSimulationPane({
  headerAccessory,
  nodes,
}: {
  headerAccessory?: ReactNode;
  nodes: SpielwieseAgentNodeVM[];
}) {
  return <PlaygroundSurface headerAccessory={headerAccessory} nodes={nodes} />;
}
