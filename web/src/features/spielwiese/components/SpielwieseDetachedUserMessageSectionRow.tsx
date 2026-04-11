import { useState } from "react";
import Image from "next/image";
import { Maximize2, Minimize2, Paperclip } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { SpielwieseMessageSectionHeader } from "./SpielwieseMessageSectionHeader";
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
      className="block min-w-0 px-2.5 pb-2"
      data-testid="spielwiese-detached-user-input-shell"
    >
      <div className={spielwieseMessageFieldShellClassName}>
        <Textarea
          aria-label={`${nodeId} ${section.label}`}
          className={cn(
            spielwieseSingleLineTextareaClassName,
            toneClassNames.field,
            "placeholder:text-foreground/36",
          )}
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

function DetachedUserUploadFileTag() {
  return (
    <button
      aria-label="Upload file"
      className="bg-background/88 text-foreground/62 hover:bg-background hover:text-foreground inline-flex h-6 shrink-0 items-center gap-1.5 overflow-visible rounded-[8px] border border-[rgba(0,0,0,0.08)] py-0 pr-1.5 pl-0 shadow-[inset_0_1px_0_hsl(var(--background)/0.96)] outline-none focus-visible:ring-0"
      data-testid="spielwiese-detached-user-upload-tag"
      type="button"
    >
      <span
        className="inline-flex items-center gap-1.25"
        data-testid="spielwiese-detached-user-upload-tag-content"
      >
        <span
          aria-hidden="true"
          className="relative -ml-0.5 size-[1.375rem] shrink-0 overflow-hidden rounded-[7px] shadow-[0_1px_2px_rgba(0,0,0,0.22)] after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.98)]"
          data-testid="spielwiese-detached-user-upload-thumb"
        >
          <Image
            alt=""
            className="h-full w-full object-cover"
            src="/spielwiese/upload-file-thumb.webp"
            height={22}
            width={22}
          />
        </span>
        <Paperclip
          aria-hidden="true"
          className="text-foreground/32 size-3 shrink-0 stroke-[2.2px]"
          data-testid="spielwiese-detached-user-upload-suffix-icon"
        />
        <span className="text-[0.6875rem] font-medium whitespace-nowrap">
          Upload file
        </span>
      </span>
    </button>
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
    <div className="grid gap-1.5">
      <div
        className={cn(
          "group flex w-full flex-col overflow-visible px-2.5 py-2",
          getMessageSectionRowRadiusClassName(section.id),
          toneClassNames.surface,
        )}
        data-section-id={section.id}
        data-testid="spielwiese-message-section-row"
      >
        <SpielwieseMessageSectionHeader
          canMoveDown={canMoveDown}
          canMoveUp={canMoveUp}
          inlineAccessory={<DetachedUserUploadFileTag />}
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
