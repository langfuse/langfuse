import { type ReactNode, useState } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
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
    <div className="flex w-full max-w-full items-start gap-2.5 py-0">
      <div className="text-muted-foreground shrink-0 font-mono text-[11px] tracking-wide whitespace-nowrap uppercase">
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
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
    <div
      className="mt-4 ml-1 flex h-[104px] max-h-[104px] w-full flex-col items-start justify-start gap-3.5 overflow-hidden rounded-t-[6px] border border-[rgba(0,0,0,0.05)] bg-white p-4 text-base shadow-[0_0_0_3px_rgba(0,0,0,0.03)]"
      data-testid="spielwiese-assistant-reply-card"
    >
      <AssistantReplyPane label="RECEIVES">
        <Textarea
          aria-label={`${nodeId} receives context`}
          className={cn(
            `${inlineTextareaClassName} [field-sizing:content] min-h-6 w-full overflow-hidden text-base leading-7 sm:text-[0.9375rem]`,
            toneClassNames.field,
            !receivesValue && "text-muted-foreground italic",
          )}
          data-testid="spielwiese-assistant-receives-value"
          name={`${nodeId}-${section.id}-receives`}
          readOnly
          rows={1}
          value={receivesValue || "No user message connected yet."}
        />
      </AssistantReplyPane>
      <AssistantReplyPane label="RESPONDS">
        <Textarea
          aria-label={`${nodeId} ${displayLabel}`}
          className={cn(
            `${inlineTextareaClassName} [field-sizing:content] min-h-6 w-full overflow-hidden text-base leading-7 sm:text-[0.9375rem]`,
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
      className="border-border/40 group mx-2.5 flex flex-col overflow-hidden rounded-xl border bg-transparent px-2.5 py-2"
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
