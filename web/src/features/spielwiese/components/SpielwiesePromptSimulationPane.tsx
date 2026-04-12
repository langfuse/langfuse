/* eslint-disable max-lines-per-function */
import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronRight, History, Play } from "lucide-react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Button } from "../ui/button";
import {
  SpielwiesePromptDeckCardHeaderFrame,
  SpielwiesePromptDeckCardShell,
} from "./SpielwiesePromptDeckCardChrome";
import {
  getThinkingSummary,
  PlaygroundThinkingDetailCard,
} from "./SpielwiesePlaygroundThinkingCard";
import { PlaygroundFlowNodeHeader } from "./SpielwiesePlaygroundFlowNodeChrome";
import {
  getPlaygroundFlowPreview,
  SpielwiesePlaygroundFlowPromptPreview,
} from "./SpielwiesePlaygroundFlowPromptPreview";
import {
  spielwieseHeaderButtonAccentClassName,
  spielwieseHeaderButtonBaseClassName,
} from "./spielwieseHeaderButtonStyles";
import { cn } from "@/src/utils/tailwind";

const playgroundActionButtonClassName = `${spielwieseHeaderButtonBaseClassName} inline-flex h-6 items-center gap-1.25 rounded-[10px] py-0 pr-2 pl-1.5 text-[11px] font-medium`;

function PlaygroundFlowCardShell({
  isThinkingDetailOpen,
  isThinking,
  kind,
  onThinkingCardClick,
  preview,
  thinkingSummary,
  title,
}: {
  isThinkingDetailOpen: boolean;
  isThinking: boolean;
  kind: string;
  onThinkingCardClick: () => void;
  preview: ReturnType<typeof getPlaygroundFlowPreview>;
  thinkingSummary: string;
  title: string;
}) {
  return (
    <div
      className="border-border/40 bg-background/96 flex w-full min-w-0 flex-col rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border pb-[4px]"
      data-testid="spielwiese-playground-flow-node"
    >
      <PlaygroundFlowNodeHeader
        isThinkingDetailOpen={isThinkingDetailOpen}
        isThinking={isThinking}
        kind={kind}
        onThinkingCardClick={onThinkingCardClick}
        thinkingSummary={thinkingSummary}
        title={title}
      />
      {preview ? (
        <div
          className="w-full min-w-0 px-[5px]"
          data-testid="spielwiese-playground-flow-preview-shell"
        >
          <SpielwiesePlaygroundFlowPromptPreview preview={preview} />
        </div>
      ) : null}
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
  const preview = getPlaygroundFlowPreview(node);
  const thinkingSummary = getThinkingSummary(node);

  return (
    <>
      <SpielwiesePromptDeckCardShell
        className="min-w-full shrink-0 [--node-shell-radius:18px]"
        data-testid="spielwiese-playground-flow-step"
      >
        <SpielwiesePromptDeckCardHeaderFrame
          data-testid="spielwiese-playground-flow-card-frame"
          overlap={false}
        >
          <PlaygroundFlowCardShell
            isThinkingDetailOpen={isThinkingDetailOpen}
            isThinking={isThinking}
            kind={node.kind}
            onThinkingCardClick={onThinkingCardClick}
            preview={preview}
            thinkingSummary={thinkingSummary}
            title={node.title}
          />
        </SpielwiesePromptDeckCardHeaderFrame>
        {node.playgroundThinking && isThinkingDetailOpen ? (
          <PlaygroundThinkingDetailCard thinking={node.playgroundThinking} />
        ) : null}
      </SpielwiesePromptDeckCardShell>
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
