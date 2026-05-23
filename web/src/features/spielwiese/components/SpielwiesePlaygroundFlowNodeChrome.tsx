import { UserRound } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { SpielwieseNodeActionButtons } from "./SpielwieseAgentNodeHeaderActions";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";
import { PlaygroundThinkingCard } from "./SpielwiesePlaygroundThinkingCard";

type PlaygroundFlowHeaderTagEntry = {
  currentModel?: string;
  id: string;
  kind: "agent" | "user";
  title: string;
};

const noop = () => {};

function getPlaygroundFlowHeaderTagEntries(
  node: Pick<
    SpielwieseAgentNodeVM,
    "id" | "kind" | "layout" | "promptSections" | "settings" | "title"
  >,
): PlaygroundFlowHeaderTagEntry[] {
  const entries: PlaygroundFlowHeaderTagEntry[] = [];
  const nodeLayout = node.layout ?? "composite";
  const userSection = node.promptSections.find((section) =>
    section.id.startsWith("user"),
  );
  const currentModel =
    node.settings.find((setting) => setting.id === "model")?.value ?? undefined;
  const agentTitle =
    nodeLayout === "user-only" && node.kind === "Input"
      ? "Agent"
      : node.title.trim() || "Agent";

  if (nodeLayout !== "agent-only") {
    entries.push({
      id: `${node.id}-user`,
      kind: "user",
      title: userSection?.label ?? "User",
    });
  }

  entries.push({
    currentModel,
    id: `${node.id}-agent`,
    kind: "agent",
    title: agentTitle,
  });

  return entries;
}

function PlaygroundFlowNodeTag({
  currentModel,
  isActive,
  kind,
  title,
}: {
  currentModel?: string;
  isActive: boolean;
  kind: "agent" | "user";
  title: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-7 max-w-full min-w-0 shrink-0 items-center overflow-hidden rounded-[10px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1",
        isActive
          ? "bg-background text-foreground border-[rgba(0,0,0,0.08)] ring-black/4"
          : "text-foreground/72 border-[rgba(0,0,0,0.05)] bg-[rgba(247,247,247,0.92)] ring-black/[0.02]",
      )}
      data-state={isActive ? "active" : "inactive"}
      data-kind={kind}
      data-testid="spielwiese-playground-flow-node-tag"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-full w-6 shrink-0 items-center justify-center border-r",
          isActive
            ? "border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.02)]"
            : "border-[rgba(0,0,0,0.04)] bg-[rgba(0,0,0,0.015)]",
        )}
      >
        {kind === "agent" ? (
          <SpielwieseModelProviderMark
            className={cn(
              "size-3 object-contain",
              isActive ? "opacity-100" : "opacity-76",
            )}
            currentModel={currentModel}
          />
        ) : (
          <UserRound
            className={cn(
              "size-3 shrink-0",
              isActive ? "text-foreground/70" : "text-foreground/54",
            )}
            data-testid="spielwiese-playground-flow-user-icon"
          />
        )}
      </span>
      <span className="min-w-0 truncate px-2.5 text-[13px] font-medium tracking-[-0.01em]">
        {title}
      </span>
    </div>
  );
}

function PlaygroundFlowNodeTagStrip({
  activeTagId,
  entries,
}: {
  activeTagId: string;
  entries: PlaygroundFlowHeaderTagEntry[];
}) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1 overflow-hidden"
      data-testid="spielwiese-playground-flow-node-tag-strip"
    >
      {entries.map((entry) => (
        <PlaygroundFlowNodeTag
          currentModel={entry.currentModel}
          isActive={entry.id === activeTagId}
          key={entry.id}
          kind={entry.kind}
          title={entry.title}
        />
      ))}
    </div>
  );
}

export function PlaygroundFlowNodeHeader({
  activeTagId,
  isThinkingDetailOpen,
  isThinking,
  node,
  showActionButtons = true,
  thinkingMeta,
  onThinkingCardClick,
  thinkingSummary,
}: {
  activeTagId: string;
  isThinkingDetailOpen: boolean;
  isThinking: boolean;
  node: Pick<
    SpielwieseAgentNodeVM,
    "id" | "kind" | "layout" | "promptSections" | "settings" | "title"
  >;
  showActionButtons?: boolean;
  thinkingMeta: Parameters<typeof PlaygroundThinkingCard>[0]["meta"];
  onThinkingCardClick: () => void;
  thinkingSummary: string;
}) {
  const entries = getPlaygroundFlowHeaderTagEntries(node);

  return (
    <div
      className="flex w-full min-w-0 items-center gap-1.5 pt-[6px] pr-[6px] pb-[5px] pl-[6px]"
      data-testid="spielwiese-playground-flow-header-row"
    >
      <PlaygroundFlowNodeTagStrip activeTagId={activeTagId} entries={entries} />
      <div className="flex shrink-0 items-center gap-1">
        <PlaygroundThinkingCard
          isDetailOpen={isThinkingDetailOpen}
          isVisible={isThinking}
          meta={thinkingMeta}
          onClick={onThinkingCardClick}
          summary={thinkingSummary}
        />
        {showActionButtons ? (
          <SpielwieseNodeActionButtons
            archiveButtonLabel={`Archive ${node.id} node`}
            compactButtonLabel={`Minimize ${node.id} node sections`}
            compactButtonIsInert
            containerTestId="spielwiese-playground-flow-node-actions"
            isCompact={false}
            isPreviewButtonDisabled
            isPreviewFocused={false}
            onArchiveNode={noop}
            onToggleCompact={noop}
            onTogglePreviewFocus={noop}
            previewButtonLabel={`Preview ${node.id} node`}
          />
        ) : null}
      </div>
    </div>
  );
}
