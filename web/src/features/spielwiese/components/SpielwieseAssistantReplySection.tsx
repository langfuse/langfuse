import { type ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Separator } from "../ui/separator";
import { Textarea } from "../ui/textarea";
import { SpielwieseMessageSectionActions } from "./SpielwieseMessageSectionActions";
import { assistantReplySectionLabel } from "./spielwiesePromptSectionLabels";
import { getMessageToneClassNames } from "./spielwieseMessageTone";

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
    <CardContent
      className="grid gap-0 p-0 sm:grid-cols-[1fr_auto_1fr]"
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
    </CardContent>
  );
}

function AssistantReplyHeading() {
  return (
    <div className="grid gap-1">
      <CardTitle className="text-base font-semibold tracking-tight">
        {assistantReplySectionLabel}
      </CardTitle>
      <CardDescription className="text-foreground/58 italic">
        When it receives this &#8594; it should respond like this
      </CardDescription>
    </div>
  );
}

function AssistantReplyHeaderActions({
  canMoveDown,
  canMoveUp,
  displayLabel,
  isCollapsed,
  nodeId,
  onDelete,
  onMoveDown,
  onMoveUp,
  onToggleCollapse,
  sectionId,
}: Pick<
  SpielwieseAssistantReplySectionProps,
  | "canMoveDown"
  | "canMoveUp"
  | "displayLabel"
  | "nodeId"
  | "onDelete"
  | "onMoveDown"
  | "onMoveUp"
> & {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  sectionId: string;
}) {
  return (
    <div className="flex shrink-0 items-start gap-0.5">
      <Button
        aria-expanded={!isCollapsed}
        aria-label={`Toggle ${nodeId} ${displayLabel} section`}
        className="text-foreground/42 hover:bg-foreground/5 hover:text-foreground/70 h-7 w-7 rounded-md"
        size="icon-sm"
        variant="ghost"
        onClick={onToggleCollapse}
      >
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform",
            isCollapsed && "-rotate-90",
          )}
        />
      </Button>
      <SpielwieseMessageSectionActions
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        nodeId={nodeId}
        onDelete={onDelete}
        onMoveDown={onMoveDown}
        onMoveUp={onMoveUp}
        sectionId={sectionId}
        sectionLabel={displayLabel}
      />
    </div>
  );
}

function AssistantReplyHeader({
  canMoveDown,
  canMoveUp,
  displayLabel,
  isCollapsed,
  nodeId,
  onDelete,
  onMoveDown,
  onMoveUp,
  onToggleCollapse,
  sectionId,
}: Pick<
  SpielwieseAssistantReplySectionProps,
  | "canMoveDown"
  | "canMoveUp"
  | "displayLabel"
  | "nodeId"
  | "onDelete"
  | "onMoveDown"
  | "onMoveUp"
> & {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  sectionId: string;
}) {
  return (
    <CardHeader className="flex-row items-start justify-between gap-3 p-4">
      <AssistantReplyHeading />
      <AssistantReplyHeaderActions
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        displayLabel={displayLabel}
        isCollapsed={isCollapsed}
        nodeId={nodeId}
        onDelete={onDelete}
        onMoveDown={onMoveDown}
        onMoveUp={onMoveUp}
        onToggleCollapse={onToggleCollapse}
        sectionId={sectionId}
      />
    </CardHeader>
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
    <Card
      className="group border-border/30 overflow-hidden shadow-none"
      data-section-id={section.id}
      data-testid="spielwiese-message-section-row"
    >
      <AssistantReplyHeader
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        displayLabel={displayLabel}
        isCollapsed={isCollapsed}
        nodeId={nodeId}
        onDelete={onDelete}
        onMoveDown={onMoveDown}
        onMoveUp={onMoveUp}
        onToggleCollapse={() => setIsCollapsed((currentValue) => !currentValue)}
        sectionId={section.id}
      />
      {isCollapsed ? null : <Separator />}
      {isCollapsed ? null : (
        <AssistantReplyBody
          displayLabel={displayLabel}
          nodeId={nodeId}
          onPromptSectionChange={onPromptSectionChange}
          receivesValue={receivesValue}
          section={section}
        />
      )}
    </Card>
  );
}
