import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Button } from "../ui/button";
import { SpielwieseDetachedUserInlineAccessories } from "./SpielwieseDetachedUserInlineAccessories";
import { SpielwieseMessageSectionHeader } from "./SpielwieseMessageSectionHeader";
import { SpielwieseMustacheTextarea } from "./SpielwieseMustacheTextarea";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";
import {
  spielwieseMessageFieldShellClassName,
  spielwieseSingleLineTextareaClassName,
} from "./SpielwieseMessageSectionBody";

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
  startCollapsed?: boolean;
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
      className="block min-w-0"
      data-testid="spielwiese-detached-user-input-shell"
    >
      <div className={spielwieseMessageFieldShellClassName}>
        <SpielwieseMustacheTextarea
          aria-label={`${nodeId} ${section.label}`}
          className={cn(
            spielwieseSingleLineTextareaClassName,
            toneClassNames.field,
            "placeholder:text-foreground/36",
          )}
          liveInline
          name={`${nodeId}-${section.id}`}
          onChange={(event) =>
            onPromptSectionChange(nodeId, section.id, event.target.value)
          }
          placeholder="Type the user's message"
          rows={1}
          value={section.value}
        />
      </div>
    </label>
  );
}

function DetachedUserCompactToggleButton({
  isCollapsed,
  nodeId,
  onToggleCollapse,
  sectionLabel,
}: {
  isCollapsed: boolean;
  nodeId: string;
  onToggleCollapse: () => void;
  sectionLabel: string;
}) {
  const ToggleIcon = isCollapsed ? Maximize2 : Minimize2;
  const compactToggleLabel = `${
    isCollapsed ? "Maximize" : "Minimize"
  } ${nodeId} ${sectionLabel} section`;

  return (
    <Button
      aria-label={compactToggleLabel}
      aria-pressed={isCollapsed}
      className="bg-background text-foreground/58 hover:bg-background hover:text-foreground h-7 w-7 shrink-0 rounded-[8px] border border-[rgba(0,0,0,0.08)]"
      size="icon-sm"
      variant="ghost"
      onClick={onToggleCollapse}
    >
      <ToggleIcon className="size-3.5" />
    </Button>
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
  startCollapsed = false,
}: SpielwieseDetachedUserMessageSectionRowProps) {
  const [isCollapsed, setIsCollapsed] = useState(startCollapsed);
  const toneClassNames = getMessageToneClassNames(section.id);
  const toggleCollapsed = () => setIsCollapsed((currentValue) => !currentValue);

  return (
    <div
      className={cn(
        "group flex w-full flex-col gap-1.5 overflow-visible px-2.5 pt-2 pb-2",
        getMessageSectionRowRadiusClassName(section.id),
        toneClassNames.surface,
      )}
      data-section-id={section.id}
      data-testid="spielwiese-message-section-row"
    >
      <SpielwieseMessageSectionHeader
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        inlineAccessory={<SpielwieseDetachedUserInlineAccessories />}
        isCollapsed={isCollapsed}
        label={displayLabel}
        nodeId={nodeId}
        onDelete={() => onPromptSectionDelete(nodeId, section.id)}
        onMoveDown={() => onPromptSectionMove(nodeId, section.id, "down")}
        onMoveUp={() => onPromptSectionMove(nodeId, section.id, "up")}
        onToggleCollapse={toggleCollapsed}
        sectionId={section.id}
        trailingAccessory={
          <DetachedUserCompactToggleButton
            isCollapsed={isCollapsed}
            nodeId={nodeId}
            onToggleCollapse={toggleCollapsed}
            sectionLabel={displayLabel}
          />
        }
        value={section.value}
      />
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
