import { useState } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Textarea } from "../ui/textarea";
import { SpielwieseMessageSectionHeader } from "./SpielwieseMessageSectionHeader";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";
import { spielwieseInlineTextareaClassName } from "./SpielwieseMessageSectionBody";

function getMessageSectionRowRadiusClassName(sectionId: string) {
  return getMessageKind(sectionId) === "user"
    ? "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]"
    : "rounded-xl";
}

type SpielwieseDetachedUserMessageSectionRowProps = {
  canMoveDown: boolean;
  canMoveUp: boolean;
  displayLabel: string;
  nodeId: string;
  onPromptSectionChange: (
    nodeId: string,
    sectionId: string,
    value: string,
  ) => void;
  onPromptSectionDelete: (nodeId: string, sectionId: string) => void;
  onPromptSectionMove: (
    nodeId: string,
    sectionId: string,
    direction: "up" | "down",
  ) => void;
  section: SpielwieseAgentNodeVM["promptSections"][number];
};

function DetachedUserInputShell({
  nodeId,
  onPromptSectionChange,
  section,
}: Pick<
  SpielwieseDetachedUserMessageSectionRowProps,
  "nodeId" | "onPromptSectionChange" | "section"
>) {
  const toneClassNames = getMessageToneClassNames(section.id);

  return (
    <label
      className="flex min-w-0 items-start overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-[oklch(0.97_0.002_95)] shadow-[inset_0_1px_0_hsl(var(--background)/0.88)]"
      data-testid="spielwiese-detached-user-input-shell"
    >
      <div className="grid h-9 w-8 shrink-0 place-items-center border-r border-[rgba(0,0,0,0.05)] bg-[oklch(0.964_0.002_95)]">
        <UserRound
          className="text-foreground/54 size-3.5 shrink-0"
          data-testid={`${nodeId}-user-tag-icon`}
        />
      </div>
      <Textarea
        aria-label={`${nodeId} ${section.label}`}
        className={cn(
          `${spielwieseInlineTextareaClassName} placeholder:text-foreground/36 [field-sizing:content] min-h-9 w-full overflow-hidden px-2.5 py-1.5 text-base leading-7 sm:text-[0.9375rem]`,
          toneClassNames.field,
        )}
        name={`${nodeId}-${section.id}`}
        onChange={(event) =>
          onPromptSectionChange(nodeId, section.id, event.target.value)
        }
        placeholder="Type the user's message"
        rows={1}
        value={section.value}
      />
    </label>
  );
}

export function SpielwieseDetachedUserMessageSectionRow({
  canMoveDown,
  canMoveUp,
  displayLabel,
  nodeId,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionMove,
  section,
}: SpielwieseDetachedUserMessageSectionRowProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const toneClassNames = getMessageToneClassNames(section.id);

  return (
    <div className="grid gap-1.5">
      <div
        className={cn(
          "group flex w-full flex-col overflow-hidden px-2.5 py-2",
          getMessageSectionRowRadiusClassName(section.id),
          toneClassNames.surface,
        )}
        data-section-id={section.id}
        data-testid="spielwiese-message-section-row"
      >
        <SpielwieseMessageSectionHeader
          canMoveDown={canMoveDown}
          canMoveUp={canMoveUp}
          isCollapsed={isCollapsed}
          label={displayLabel}
          nodeId={nodeId}
          onDelete={() => onPromptSectionDelete(nodeId, section.id)}
          onMoveDown={() => onPromptSectionMove(nodeId, section.id, "down")}
          onMoveUp={() => onPromptSectionMove(nodeId, section.id, "up")}
          onToggleCollapse={() =>
            setIsCollapsed((currentValue) => !currentValue)
          }
          sectionId={section.id}
          value={section.value}
        />
      </div>
      {isCollapsed ? null : (
        <DetachedUserInputShell
          nodeId={nodeId}
          onPromptSectionChange={onPromptSectionChange}
          section={section}
        />
      )}
    </div>
  );
}
