/* eslint-disable max-lines-per-function */
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { History, Play } from "lucide-react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Button } from "../ui/button";
import type { PlaygroundFlowPreviewVM } from "./SpielwiesePlaygroundFlowPromptPreview";
import {
  adanaKebabPreviewLines,
  createPendingSimulationPreview,
  createSimulationPreview,
  getSimulationTargetNode,
} from "./spielwiesePromptSimulationRun";
import { PlaygroundFlowNode } from "./spielwiesePromptSimulationFlowNode";
import {
  spielwieseHeaderButtonAccentClassName,
  spielwieseHeaderButtonBaseClassName,
} from "./spielwieseHeaderButtonStyles";
import { cn } from "@/src/utils/tailwind";

const playgroundActionButtonClassName = `${spielwieseHeaderButtonBaseClassName} inline-flex h-6 items-center gap-1.25 rounded-[10px] py-0 pr-2 pl-1.5 text-[11px] font-medium`;
const playgroundBlockedActionButtonClassName = `${playgroundActionButtonClassName} pointer-events-none cursor-default`;

function PlaygroundSurface({
  headerAccessory,
  nodes,
}: {
  headerAccessory?: ReactNode;
  nodes: SpielwieseAgentNodeVM[];
}) {
  const visibleNodes = nodes.filter((node): node is SpielwieseAgentNodeVM =>
    Boolean(node),
  );
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const pendingTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const [activeThinkingNodeId, setActiveThinkingNodeId] = useState<
    string | null
  >(null);
  const [expandedThinkingNodeId, setExpandedThinkingNodeId] = useState<
    string | null
  >(null);
  const [runtimePreviewByNodeId, setRuntimePreviewByNodeId] = useState<
    Record<string, PlaygroundFlowPreviewVM | undefined>
  >({});
  const [isPlaying, setIsPlaying] = useState(false);

  const clearPendingTimeouts = () => {
    pendingTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    pendingTimeoutsRef.current = [];
  };

  const scheduleUpdate = (callback: () => void, delay: number) => {
    const timeoutId = setTimeout(() => {
      pendingTimeoutsRef.current = pendingTimeoutsRef.current.filter(
        (pendingTimeoutId) => pendingTimeoutId !== timeoutId,
      );

      if (!surfaceRef.current) {
        return;
      }

      callback();
    }, delay);

    pendingTimeoutsRef.current.push(timeoutId);
  };

  const handlePlay = () => {
    const targetNode = getSimulationTargetNode(visibleNodes);

    clearPendingTimeouts();
    setExpandedThinkingNodeId(null);
    setRuntimePreviewByNodeId((currentValue) =>
      targetNode
        ? {
            ...currentValue,
            [targetNode.id]: createPendingSimulationPreview(targetNode),
          }
        : currentValue,
    );

    if (!targetNode) {
      setIsPlaying(false);
      setActiveThinkingNodeId(null);
      return;
    }

    setIsPlaying(true);
    setActiveThinkingNodeId(targetNode.id);

    scheduleUpdate(() => {
      setActiveThinkingNodeId(null);
    }, 3000);

    adanaKebabPreviewLines.forEach((_, index) => {
      scheduleUpdate(
        () => {
          setRuntimePreviewByNodeId((currentValue) => ({
            ...currentValue,
            [targetNode.id]: createSimulationPreview(
              targetNode,
              adanaKebabPreviewLines.slice(0, index + 1).join("\n"),
              index === adanaKebabPreviewLines.length - 1
                ? "settled"
                : "streaming",
            ),
          }));
        },
        3000 + (index + 1) * 48,
      );
    });

    scheduleUpdate(
      () => {
        setIsPlaying(false);
      },
      3000 + adanaKebabPreviewLines.length * 48,
    );
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F3F3F4] px-0 pt-0.5 pb-0"
      data-testid="spielwiese-prompt-simulation-pane"
      ref={surfaceRef}
    >
      <div
        className="flex min-h-0 w-full min-w-0 flex-1 flex-col rounded-[var(--canvas-pane-outer-radius)] border border-black/10 bg-[#F3F3F4] p-[var(--canvas-pane-shell-gap)] shadow-xs [--canvas-pane-inner-radius:18px] [--canvas-pane-outer-radius:calc(var(--canvas-pane-inner-radius)+var(--canvas-pane-shell-gap))] [--canvas-pane-shell-gap:2px]"
        data-testid="spielwiese-playground-terminal-shell"
      >
        <div
          className="bg-background relative flex min-h-full w-full min-w-0 flex-1 flex-col overflow-visible rounded-[var(--canvas-pane-inner-radius)] px-2.5 pt-0 pb-0"
          data-testid="spielwiese-playground-terminal-surface"
        >
          <div
            className="sticky top-0 z-10 -mx-2.5 flex w-[calc(100%+1.25rem)] items-center gap-2 rounded-t-[var(--canvas-pane-inner-radius)] border-b border-black/5 bg-[rgba(251,251,251,0.82)] px-2 pt-2 pb-2 supports-[backdrop-filter]:bg-[rgba(251,251,251,0.72)] supports-[backdrop-filter]:backdrop-blur-md"
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
                aria-disabled="true"
                className={playgroundBlockedActionButtonClassName}
                data-testid="spielwiese-playground-history-button"
                size="sm"
                tabIndex={-1}
                variant="ghost"
              >
                <History aria-hidden="true" className="size-3 shrink-0" />
                <span>History</span>
              </Button>
              <Button
                aria-pressed={isPlaying}
                className={cn(
                  playgroundActionButtonClassName,
                  isPlaying && spielwieseHeaderButtonAccentClassName,
                )}
                data-testid="spielwiese-playground-play-button"
                size="sm"
                variant="ghost"
                onClick={handlePlay}
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
              {visibleNodes.map((node, index) => (
                <PlaygroundFlowNode
                  isThinkingDetailOpen={expandedThinkingNodeId === node.id}
                  isLast={index === visibleNodes.length - 1}
                  isThinking={activeThinkingNodeId === node.id}
                  key={node.id}
                  node={node}
                  runtimePreview={runtimePreviewByNodeId[node.id]}
                  showActionButtons
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
