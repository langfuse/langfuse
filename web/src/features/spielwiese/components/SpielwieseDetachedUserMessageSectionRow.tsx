import { useState } from "react";
import Image from "next/image";
import {
  CircleQuestionMark,
  Maximize2,
  Minimize2,
  Paperclip,
  Table2,
} from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Button } from "../ui/button";
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
      className="block min-w-0 px-2.5 pb-2"
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

function DetachedUserUploadFileTag() {
  return (
    <button
      aria-label="Upload file"
      className="bg-background/88 text-foreground/62 hover:bg-background hover:text-foreground inline-flex h-6 shrink-0 items-center gap-1.5 overflow-visible rounded-[8px] border border-[rgba(0,0,0,0.08)] py-0 pr-1.5 pl-0 shadow-[inset_0_1px_0_hsl(var(--background)/0.96)] outline-none focus-visible:ring-0"
      data-testid="spielwiese-detached-user-upload-tag"
      type="button"
    >
      <span
        className="inline-flex h-full items-center gap-1.25"
        data-testid="spielwiese-detached-user-upload-tag-content"
      >
        <span
          aria-hidden="true"
          className="relative -ml-px aspect-square h-full shrink-0 overflow-hidden rounded-[7px] shadow-[0_1px_2px_rgba(0,0,0,0.22)] after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_2px_rgba(255,255,255,0.98)]"
          data-testid="spielwiese-detached-user-upload-thumb"
        >
          <Image
            alt=""
            className="h-full w-full object-cover"
            src="/spielwiese/upload-file-thumb.webp"
            height={24}
            width={24}
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

function DetachedUserUploadDatasetTag() {
  return (
    <button
      aria-label="Upload dataset"
      className="bg-background/88 text-foreground/62 hover:bg-background hover:text-foreground inline-flex h-6 shrink-0 items-center gap-1.25 overflow-visible rounded-[8px] border border-[rgba(0,0,0,0.08)] pr-1.5 pl-1.5 shadow-[inset_0_1px_0_hsl(var(--background)/0.96)] outline-none focus-visible:ring-0"
      data-testid="spielwiese-detached-user-upload-dataset-tag"
      type="button"
    >
      <Table2
        aria-hidden="true"
        className="text-foreground/32 size-3 shrink-0 stroke-[2.2px]"
        data-testid="spielwiese-detached-user-upload-dataset-icon"
      />
      <span className="text-[0.6875rem] font-medium whitespace-nowrap">
        Upload dataset
      </span>
      <span
        className="text-foreground/46 inline-flex size-3.5 shrink-0 items-center justify-center"
        data-testid="spielwiese-detached-user-upload-dataset-info-affordance"
      >
        <CircleQuestionMark
          aria-hidden="true"
          className="size-3 shrink-0 stroke-[2.2px]"
          data-testid="spielwiese-detached-user-upload-dataset-info-icon"
        />
      </span>
    </button>
  );
}

const detachedUserDatasetTooltipCopy =
  "Run the same prompt against a batch of user messages at once so you can compare outputs and tune the prompt faster.";
const detachedUserDatasetTooltipClassName =
  "text-foreground/72 pointer-events-none absolute top-full left-0 z-20 mt-2 w-[15rem] translate-y-1 rounded-[12px] bg-[rgba(255,255,255,0.98)] px-3 py-2 text-[0.75rem] leading-4 font-medium opacity-0 shadow-[0_16px_40px_rgba(15,23,42,0.12),0_4px_14px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-[opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-focus-within/dataset-tooltip:translate-y-0 group-focus-within/dataset-tooltip:opacity-100 group-hover/dataset-tooltip:translate-y-0 group-hover/dataset-tooltip:opacity-100";

function DetachedUserDatasetAccessory() {
  return (
    <div
      className="group/dataset-tooltip relative flex shrink-0 items-center overflow-visible"
      data-testid="spielwiese-detached-user-upload-dataset-accessory"
    >
      <DetachedUserUploadDatasetTag />
      <div
        className={detachedUserDatasetTooltipClassName}
        data-testid="spielwiese-detached-user-upload-dataset-tooltip"
        role="tooltip"
      >
        {detachedUserDatasetTooltipCopy}
      </div>
    </div>
  );
}

function DetachedUserInlineAccessories() {
  return (
    <div className="flex items-center gap-1.5 overflow-visible">
      <DetachedUserUploadFileTag />
      <DetachedUserDatasetAccessory />
    </div>
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
          "group flex w-full flex-col overflow-visible px-2.5 pt-2 pb-2",
          getMessageSectionRowRadiusClassName(section.id),
          toneClassNames.surface,
        )}
        data-section-id={section.id}
        data-testid="spielwiese-message-section-row"
      >
        <SpielwieseMessageSectionHeader
          canMoveDown={canMoveDown}
          canMoveUp={canMoveUp}
          inlineAccessory={<DetachedUserInlineAccessories />}
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
