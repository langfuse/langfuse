import { ChevronRight, UserRound } from "lucide-react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";

function getNodeModelLabel(node: SpielwieseAgentNodeVM) {
  return node.settings.find((setting) => setting.id === "model")?.value;
}

function nodeHasUserSection(node: SpielwieseAgentNodeVM) {
  return node.promptSections.some(
    (section) => getMessageKind(section.id) === "user",
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
  const userToneClassNames = getMessageToneClassNames("user");

  return (
    <>
      <div
        className="group flex w-fit shrink-0 flex-col gap-1.5 overflow-hidden rounded-(--node-shell-radius) border border-[rgba(0,0,0,0.05)] bg-[#FBFBFB] px-[2px] pt-[2px] pb-[2px] [--node-shell-gap:2px] [--node-shell-radius:16px]"
        data-testid="spielwiese-playground-flow-step"
      >
        <div
          className="border-border/40 bg-background/96 flex min-w-0 items-center gap-2 rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))] border px-2.5 py-2"
          data-testid="spielwiese-playground-flow-node"
        >
          {nodeHasUserSection(node) ? (
            <span
              aria-hidden="true"
              className={`inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border shadow-none ${userToneClassNames.chip}`}
              data-testid="spielwiese-playground-flow-user-icon"
            >
              <UserRound
                className={`size-3 shrink-0 ${userToneClassNames.label}`}
              />
            </span>
          ) : null}
          <SpielwieseModelProviderMark currentModel={modelLabel} />
          <span className="text-foreground truncate text-[0.8125rem] font-medium">
            {node.title}
          </span>
        </div>
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
        className="bg-background flex min-h-0 flex-1 items-start rounded-[8px] px-4 py-3 shadow-xs"
        data-testid="spielwiese-playground-terminal-shell"
      >
        <div
          className="flex min-w-0 flex-1 items-start gap-2 overflow-x-auto"
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
