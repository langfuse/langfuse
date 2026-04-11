import { type ReactNode, useState } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Separator } from "../ui/separator";
import { Textarea } from "../ui/textarea";
import { getMessageToneClassNames } from "./spielwieseMessageTone";
import { SpielwieseMessageSectionHeader } from "./SpielwieseMessageSectionHeader";

const inlineTextareaClassName =
  "h-full rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0";

type SpielwieseAssistantReplySectionProps = {
  canMoveDown: boolean;
  canMoveUp: boolean;
  displayLabel: string;
  nodeId: string;
  onDelete: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onPromptSectionChange: (
    nodeId: string,
    sectionId: string,
    value: string,
  ) => void;
  receivesValue?: string;
  section: SpielwieseAgentNodeVM["promptSections"][number];
};

function AssistantReplyPane({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="grid gap-2 px-4 py-4">
      <div className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function AssistantReplyBody({
  displayLabel,
  nodeId,
  onPromptSectionChange,
  receivesValue,
  section,
}: Pick<
  SpielwieseAssistantReplySectionProps,
  | "displayLabel"
  | "nodeId"
  | "onPromptSectionChange"
  | "receivesValue"
  | "section"
>) {
  const toneClassNames = getMessageToneClassNames(section.id);

  return (
    <div className={cn("px-2.5 pt-0.5 pb-2.5 text-base", toneClassNames.body)}>
      <div
        className="border-border/60 bg-background grid gap-0 overflow-hidden rounded-md border sm:grid-cols-[1fr_auto_1fr]"
        data-testid="spielwiese-assistant-reply-card"
      >
        <AssistantReplyPane label="RECEIVES">
          <div
            className={cn(
              "text-foreground min-h-20 font-mono text-[14px] leading-7 break-words whitespace-pre-wrap",
              !receivesValue && "text-muted-foreground italic",
            )}
            data-testid="spielwiese-assistant-receives-value"
          >
            {receivesValue || "No user message connected yet."}
          </div>
        </AssistantReplyPane>
        <Separator className="sm:hidden" />
        <Separator className="hidden sm:block" orientation="vertical" />
        <AssistantReplyPane label="RESPONDS">
          <Textarea
            aria-label={`${nodeId} ${displayLabel}`}
            className={cn(
              `${inlineTextareaClassName} [field-sizing:content] min-h-20 overflow-hidden font-mono text-[14px] leading-7`,
              toneClassNames.field,
            )}
            data-testid="spielwiese-assistant-responds-input"
            name={`${nodeId}-${section.id}`}
            onChange={(event) =>
              onPromptSectionChange(nodeId, section.id, event.target.value)
            }
            rows={1}
            value={section.value}
          />
        </AssistantReplyPane>
      </div>
    </div>
  );
}

export function SpielwieseAssistantReplySection({
  canMoveDown,
  canMoveUp,
  displayLabel,
  nodeId,
  onDelete,
  onMoveDown,
  onMoveUp,
  onPromptSectionChange,
  receivesValue,
  section,
}: SpielwieseAssistantReplySectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      className="border-border/30 group flex w-full flex-col overflow-hidden rounded-lg border"
      data-section-id={section.id}
      data-testid="spielwiese-message-section-row"
    >
      <SpielwieseMessageSectionHeader
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        isCollapsed={isCollapsed}
        label={displayLabel}
        nodeId={nodeId}
        onDelete={onDelete}
        onMoveDown={onMoveDown}
        onMoveUp={onMoveUp}
        onToggleCollapse={() => setIsCollapsed((currentValue) => !currentValue)}
        sectionId={section.id}
        value={section.value}
      />
      {isCollapsed ? null : (
        <AssistantReplyBody
          displayLabel={displayLabel}
          nodeId={nodeId}
          onPromptSectionChange={onPromptSectionChange}
          receivesValue={receivesValue}
          section={section}
        />
      )}
    </div>
  );
}
