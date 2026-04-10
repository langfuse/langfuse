import { useState } from "react";
import {
  Brackets,
  ChevronDown,
  CircleMinus,
  FilePlus,
  ImagePlus,
} from "lucide-react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

type SpielwieseAgentNodePromptSectionsProps = {
  nodeId: string;
  onPromptSectionChange: (
    nodeId: string,
    sectionId: string,
    value: string,
  ) => void;
  promptSections: SpielwieseAgentNodeVM["promptSections"];
};

const inlineTextareaClassName =
  "h-full rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0";

function getPlaceholderCount(value: string) {
  const placeholderMatches = value.match(/\[[^\]]+\]/g);
  return Math.max(placeholderMatches?.length ?? 0, 1);
}

function getInlinePreview(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getMessageToneClassNames(sectionId: string) {
  if (sectionId === "user") {
    return {
      action: "text-dark-green hover:bg-background/50 hover:text-dark-green",
      body: "bg-light-green/35",
      count:
        "text-dark-green/70 group-hover:text-dark-green group-focus-within:text-dark-green",
      label: "bg-light-green/70 text-dark-green",
      field:
        "border-transparent bg-background/35 text-dark-green placeholder:text-dark-green/60 shadow-none focus-visible:border-transparent focus-visible:ring-background/50",
      header: "bg-light-green/40",
    };
  }

  if (sectionId === "assistant") {
    return {
      action: "text-dark-red hover:bg-background/50 hover:text-dark-red",
      body: "bg-light-red/35",
      count:
        "text-dark-red/70 group-hover:text-dark-red group-focus-within:text-dark-red",
      label: "bg-light-red/70 text-dark-red",
      field:
        "border-transparent bg-background/35 text-dark-red placeholder:text-dark-red/60 shadow-none focus-visible:border-transparent focus-visible:ring-background/50",
      header: "bg-light-red/40",
    };
  }

  return {
    action: "text-dark-yellow hover:bg-background/50 hover:text-dark-yellow",
    body: "bg-light-yellow/35",
    count:
      "text-dark-yellow/70 group-hover:text-dark-yellow group-focus-within:text-dark-yellow",
    label: "bg-light-yellow/70 text-dark-yellow",
    field:
      "border-transparent bg-background/35 text-dark-yellow placeholder:text-dark-yellow/60 shadow-none focus-visible:border-transparent focus-visible:ring-background/50",
    header: "bg-light-yellow/40",
  };
}

function MessageSectionActions({
  nodeId,
  sectionId,
  sectionLabel,
}: {
  nodeId: string;
  sectionId: string;
  sectionLabel: string;
}) {
  const toneClassNames = getMessageToneClassNames(sectionId);

  return (
    <div className="flex shrink-0 items-center opacity-0 transition-all group-focus-within:opacity-100 group-hover:opacity-100">
      <Button
        aria-label={`Add image to ${nodeId} ${sectionLabel}`}
        className={toneClassNames.action}
        size="icon-sm"
        variant="ghost"
      >
        <ImagePlus className="size-3.5" />
      </Button>
      <Button
        aria-label={`Add PDF to ${nodeId} ${sectionLabel}`}
        className={toneClassNames.action}
        size="icon-sm"
        variant="ghost"
      >
        <FilePlus className="size-3.5" />
      </Button>
      <Button
        aria-label={`Delete ${nodeId} ${sectionLabel} message`}
        className={toneClassNames.action}
        size="icon-sm"
        variant="ghost"
      >
        <CircleMinus className="size-3.5" />
      </Button>
    </div>
  );
}

function MessageSectionSummary({
  isCollapsed,
  sectionId,
  label,
  value,
}: {
  isCollapsed: boolean;
  sectionId: string;
  label: string;
  value: string;
}) {
  const toneClassNames = getMessageToneClassNames(sectionId);

  return (
    <>
      <div
        className={cn(
          "flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-bold",
          toneClassNames.label,
        )}
      >
        {label}
      </div>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 text-xs font-bold transition-all",
          toneClassNames.count,
        )}
      >
        <Brackets className="size-2.5 shrink-0 stroke-[2.65px]" />
        <span className="tabular-nums">{getPlaceholderCount(value)}</span>
      </span>
      {isCollapsed ? (
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[0.75rem] font-medium",
            toneClassNames.count,
          )}
        >
          {getInlinePreview(value)}
        </span>
      ) : null}
    </>
  );
}

function MessageSectionLeading({
  isCollapsed,
  label,
  nodeId,
  onToggleCollapse,
  sectionId,
  value,
}: {
  isCollapsed: boolean;
  label: string;
  nodeId: string;
  onToggleCollapse: () => void;
  sectionId: string;
  value: string;
}) {
  const toneClassNames = getMessageToneClassNames(sectionId);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      <Button
        aria-expanded={!isCollapsed}
        aria-label={`Toggle ${nodeId} ${label} section`}
        className={cn("shrink-0", toneClassNames.action)}
        size="icon-sm"
        variant="ghost"
        onClick={onToggleCollapse}
      >
        <ChevronDown
          className={cn(
            "size-3 transition-transform",
            isCollapsed && "-rotate-90",
          )}
        />
      </Button>
      <MessageSectionSummary
        isCollapsed={isCollapsed}
        label={label}
        sectionId={sectionId}
        value={value}
      />
    </div>
  );
}

function MessageSectionHeader({
  isCollapsed,
  label,
  nodeId,
  onToggleCollapse,
  sectionId,
  value,
}: {
  isCollapsed: boolean;
  label: string;
  nodeId: string;
  onToggleCollapse: () => void;
  sectionId: string;
  value: string;
}) {
  const toneClassNames = getMessageToneClassNames(sectionId);

  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex w-full items-center justify-between pr-3.5 pl-2",
        toneClassNames.header,
      )}
    >
      <MessageSectionLeading
        isCollapsed={isCollapsed}
        label={label}
        nodeId={nodeId}
        onToggleCollapse={onToggleCollapse}
        sectionId={sectionId}
        value={value}
      />
      <MessageSectionActions
        nodeId={nodeId}
        sectionId={sectionId}
        sectionLabel={label}
      />
    </div>
  );
}

function SpielwieseMessageSectionRow({
  nodeId,
  onPromptSectionChange,
  section,
}: {
  nodeId: string;
  onPromptSectionChange: SpielwieseAgentNodePromptSectionsProps["onPromptSectionChange"];
  section: SpielwieseAgentNodeVM["promptSections"][number];
}) {
  const heightClassName = section.id === "system" ? "h-20" : "h-12";
  const toneClassNames = getMessageToneClassNames(section.id);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="group flex w-full flex-col gap-1">
      <MessageSectionHeader
        isCollapsed={isCollapsed}
        label={section.label}
        nodeId={nodeId}
        onToggleCollapse={() => setIsCollapsed((currentValue) => !currentValue)}
        sectionId={section.id}
        value={section.value}
      />

      {isCollapsed ? null : (
        <div className={cn("px-3.5 text-base", toneClassNames.body)}>
          <div className="flex flex-col gap-2.5">
            <div className={heightClassName}>
              <Textarea
                aria-label={`${nodeId} ${section.label}`}
                className={cn(
                  `${inlineTextareaClassName} h-full min-h-0 overflow-y-auto font-mono text-[0.75rem] leading-4 max-sm:text-base/5`,
                  toneClassNames.field,
                )}
                name={`${nodeId}-${section.id}`}
                onChange={(event) =>
                  onPromptSectionChange(nodeId, section.id, event.target.value)
                }
                value={section.value}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SpielwieseAgentNodePromptSections({
  nodeId,
  onPromptSectionChange,
  promptSections,
}: SpielwieseAgentNodePromptSectionsProps) {
  return (
    <div className="border-border/50 grid gap-1.5 border-t pt-2">
      {promptSections.map((section) => (
        <SpielwieseMessageSectionRow
          key={section.id}
          nodeId={nodeId}
          onPromptSectionChange={onPromptSectionChange}
          section={section}
        />
      ))}
    </div>
  );
}
