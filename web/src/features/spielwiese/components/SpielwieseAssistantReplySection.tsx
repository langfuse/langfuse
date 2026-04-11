import { type ReactNode, useState } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Textarea } from "../ui/textarea";
import { getMessageToneClassNames } from "./spielwieseMessageTone";
import {
  spielwieseMessageFieldShellClassName,
  spielwieseSingleLineTextareaClassName,
} from "./SpielwieseMessageSectionBody";
import { SpielwieseMessageSectionHeader } from "./SpielwieseMessageSectionHeader";

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
  startCollapsed?: boolean;
};

const assistantReplyCardClassName =
  "mt-3.5 ml-1 flex h-[104px] max-h-[104px] w-full flex-col items-start justify-start gap-2.5 pr-1 text-base";

function AssistantReplyPane({
  children,
  fieldShellClassName,
  label,
}: {
  children: ReactNode;
  fieldShellClassName?: string;
  label: string;
}) {
  return (
    <div className="flex w-full max-w-full items-center gap-2.5 py-0">
      <div className="text-muted-foreground shrink-0 font-mono text-[11px] tracking-wide whitespace-nowrap uppercase">
        {label}
      </div>
      <div className={cn("min-w-0 flex-1", fieldShellClassName)}>
        {children}
      </div>
    </div>
  );
}

function AssistantReplyTextareaPane({
  ariaLabel,
  dataTestId,
  fieldClassName,
  isMuted,
  label,
  name,
  onChange,
  placeholder,
  readOnly,
  value,
}: {
  ariaLabel: string;
  dataTestId: string;
  fieldClassName: string;
  isMuted?: boolean;
  label: string;
  name: string;
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  readOnly?: boolean;
  value: string;
}) {
  return (
    <AssistantReplyPane
      fieldShellClassName={spielwieseMessageFieldShellClassName}
      label={label}
    >
      <Textarea
        aria-label={ariaLabel}
        className={cn(
          fieldClassName,
          spielwieseSingleLineTextareaClassName,
          isMuted && "text-muted-foreground italic",
        )}
        data-testid={dataTestId}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        rows={1}
        value={value}
      />
    </AssistantReplyPane>
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
      className={assistantReplyCardClassName}
      data-testid="spielwiese-assistant-reply-card"
    >
      <AssistantReplyTextareaPane
        ariaLabel={`${nodeId} receives context`}
        dataTestId="spielwiese-assistant-receives-value"
        fieldClassName={toneClassNames.field}
        isMuted={!receivesValue}
        label="RECEIVES"
        name={`${nodeId}-${section.id}-receives`}
        placeholder="No user message connected yet."
        readOnly
        value={receivesValue || ""}
      />
      <AssistantReplyTextareaPane
        ariaLabel={`${nodeId} ${displayLabel}`}
        dataTestId="spielwiese-assistant-responds-input"
        fieldClassName={toneClassNames.field}
        label="RESPONDS"
        name={`${nodeId}-${section.id}`}
        onChange={(event) =>
          onPromptSectionChange(nodeId, section.id, event.target.value)
        }
        value={section.value}
      />
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
  startCollapsed = false,
}: SpielwieseAssistantReplySectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(startCollapsed);

  return (
    <div
      className="group mx-2.5 flex flex-col overflow-hidden rounded-xl bg-transparent px-2.5 py-2"
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
