import { ChevronRight } from "lucide-react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import {
  SpielwiesePromptDeckCardHeaderFrame,
  SpielwiesePromptDeckCardShell,
} from "./SpielwiesePromptDeckCardChrome";
import {
  getThinkingCardMeta,
  getThinkingSummary,
  PlaygroundThinkingDetailCard,
} from "./SpielwiesePlaygroundThinkingCard";
import { PlaygroundFlowNodeHeader } from "./SpielwiesePlaygroundFlowNodeChrome";
import {
  getPlaygroundFlowPreview,
  type PlaygroundFlowPreviewVM,
  SpielwiesePlaygroundFlowPromptPreview,
} from "./SpielwiesePlaygroundFlowPromptPreview";
import {
  simulatedThinkingMeta,
  simulatedThinkingSummary,
} from "./spielwiesePromptSimulationRun";

function getPlaygroundFlowNodeState({
  node,
  runtimePreview,
}: {
  node: SpielwieseAgentNodeVM;
  runtimePreview?: PlaygroundFlowPreviewVM;
}) {
  return {
    activeTagId:
      (node.layout ?? "composite") === "user-only"
        ? `${node.id}-user`
        : `${node.id}-agent`,
    preview: runtimePreview ?? getPlaygroundFlowPreview(node),
    thinkingMeta: node.playgroundThinking
      ? getThinkingCardMeta(node)
      : simulatedThinkingMeta,
    thinkingSummary: node.playgroundThinking
      ? getThinkingSummary(node)
      : simulatedThinkingSummary,
  };
}

function PlaygroundFlowCardShell({
  activeTagId,
  isThinkingDetailOpen,
  isThinking,
  node,
  onThinkingCardClick,
  preview,
  thinkingMeta,
  thinkingSummary,
}: {
  activeTagId: string;
  isThinkingDetailOpen: boolean;
  isThinking: boolean;
  node: SpielwieseAgentNodeVM;
  onThinkingCardClick: () => void;
  preview: ReturnType<typeof getPlaygroundFlowPreview>;
  thinkingMeta: ReturnType<typeof getThinkingCardMeta>;
  thinkingSummary: string;
}) {
  return (
    <div
      className="border-border/40 bg-background/96 flex w-full min-w-0 flex-col rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border pb-[4px]"
      data-testid="spielwiese-playground-flow-node"
    >
      <PlaygroundFlowNodeHeader
        activeTagId={activeTagId}
        isThinkingDetailOpen={isThinkingDetailOpen}
        isThinking={isThinking}
        node={node}
        thinkingMeta={thinkingMeta}
        onThinkingCardClick={onThinkingCardClick}
        thinkingSummary={thinkingSummary}
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

export function PlaygroundFlowNode({
  isThinkingDetailOpen,
  isLast,
  isThinking,
  node,
  onThinkingCardClick,
  runtimePreview,
}: {
  isThinkingDetailOpen: boolean;
  isLast: boolean;
  isThinking: boolean;
  node: SpielwieseAgentNodeVM;
  onThinkingCardClick: () => void;
  runtimePreview?: PlaygroundFlowPreviewVM;
}) {
  const { activeTagId, preview, thinkingMeta, thinkingSummary } =
    getPlaygroundFlowNodeState({
      node,
      runtimePreview,
    });

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
            activeTagId={activeTagId}
            isThinkingDetailOpen={isThinkingDetailOpen}
            isThinking={isThinking}
            node={node}
            onThinkingCardClick={onThinkingCardClick}
            preview={preview}
            thinkingMeta={thinkingMeta}
            thinkingSummary={thinkingSummary}
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
