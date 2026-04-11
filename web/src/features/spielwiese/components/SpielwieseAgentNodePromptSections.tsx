import { useState } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { cn } from "@/src/utils/tailwind";
import { Textarea } from "../ui/textarea";
import { SpielwieseAssistantReplySection } from "./SpielwieseAssistantReplySection";
import { SpielwieseDetachedUserMessageSectionRow } from "./SpielwieseDetachedUserMessageSectionRow";
import { SpielwieseMessageInsertRow } from "./SpielwieseMessageInsertRow";
import {
  SpielwieseMessageSectionBody,
  spielwieseInlineTextareaClassName,
} from "./SpielwieseMessageSectionBody";
import { SpielwieseMessageSectionHeader } from "./SpielwieseMessageSectionHeader";
import type { SpielwieseToolOption } from "./SpielwieseToolMessageSection";
import { getPromptSectionDisplayLabel } from "./spielwiesePromptSectionLabels";
import {
  getMessageKind,
  getMessageToneClassNames,
} from "./spielwieseMessageTone";

type SpielwieseAgentNodePromptSectionsProps = {
  className?: string;
  includeKinds?: Array<"user" | "system" | "assistant" | "tool">;
  isCompact?: boolean;
  nodeId: string;
  onPromptSectionChange: (
    nodeId: string,
    sectionId: string,
    value: string,
  ) => void;
  onPromptSectionDelete: (nodeId: string, sectionId: string) => void;
  onPromptSectionInsert: (
    nodeId: string,
    kind: "user" | "system" | "assistant" | "tool",
  ) => void;
  onPromptSectionMove: (
    nodeId: string,
    sectionId: string,
    direction: "up" | "down",
  ) => void;
  promptSections: SpielwieseAgentNodeVM["promptSections"];
  showInsertRow?: boolean;
  toolOptions: SpielwieseToolOption[];
  userLayout?: "standard" | "detached";
};

type SpielwieseMessageSectionRowProps = {
  assistantReceivesValue?: string;
  canMoveDown: boolean;
  canMoveUp: boolean;
  defaultCollapsed?: boolean;
  displayLabel: string;
  nodeId: string;
  onPromptSectionChange: SpielwieseAgentNodePromptSectionsProps["onPromptSectionChange"];
  onPromptSectionDelete: SpielwieseAgentNodePromptSectionsProps["onPromptSectionDelete"];
  onPromptSectionMove: SpielwieseAgentNodePromptSectionsProps["onPromptSectionMove"];
  section: SpielwieseAgentNodeVM["promptSections"][number];
  toolOptions: SpielwieseToolOption[];
};

function getMessageSectionRowRadiusClassName(sectionId: string) {
  return getMessageKind(sectionId) === "user"
    ? "rounded-[calc(var(--node-shell-radius)-var(--node-shell-gap))]"
    : "rounded-xl";
}

function renderExpandedStandardMessageSectionContent({
  nodeId,
  onPromptSectionChange,
  section,
  toolOptions,
}: {
  nodeId: string;
  onPromptSectionChange: SpielwieseAgentNodePromptSectionsProps["onPromptSectionChange"];
  section: SpielwieseAgentNodeVM["promptSections"][number];
  toolOptions: SpielwieseToolOption[];
}) {
  const toneClassNames = getMessageToneClassNames(section.id);

  if (getMessageKind(section.id) === "user") {
    return (
      <Textarea
        aria-label={`${nodeId} ${section.label}`}
        className={cn(
          `${spielwieseInlineTextareaClassName} [field-sizing:content] min-h-6 w-full overflow-hidden px-0 pt-1 pb-0.5 text-base leading-7 sm:text-[0.9375rem]`,
          toneClassNames.field,
        )}
        name={`${nodeId}-${section.id}`}
        onChange={(event) =>
          onPromptSectionChange(nodeId, section.id, event.target.value)
        }
        rows={1}
        value={section.value}
      />
    );
  }

  return (
    <SpielwieseMessageSectionBody
      nodeId={nodeId}
      onPromptSectionChange={onPromptSectionChange}
      section={section}
      toolOptions={toolOptions}
    />
  );
}

function SpielwieseStandardMessageSectionRow({
  canMoveDown,
  canMoveUp,
  defaultCollapsed = false,
  displayLabel,
  nodeId,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionMove,
  section,
  toolOptions,
}: {
  assistantReceivesValue?: string;
  canMoveDown: boolean;
  canMoveUp: boolean;
  displayLabel: string;
  nodeId: string;
  onPromptSectionChange: SpielwieseAgentNodePromptSectionsProps["onPromptSectionChange"];
  onPromptSectionDelete: SpielwieseAgentNodePromptSectionsProps["onPromptSectionDelete"];
  onPromptSectionMove: SpielwieseAgentNodePromptSectionsProps["onPromptSectionMove"];
  section: SpielwieseAgentNodeVM["promptSections"][number];
  toolOptions: SpielwieseToolOption[];
}) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const toneClassNames = getMessageToneClassNames(section.id);

  return (
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
        onToggleCollapse={() => setIsCollapsed((currentValue) => !currentValue)}
        sectionId={section.id}
        value={section.value}
      />
      {isCollapsed
        ? null
        : renderExpandedStandardMessageSectionContent({
            nodeId,
            onPromptSectionChange,
            section,
            toolOptions,
          })}
    </div>
  );
}

function SpielwieseMessageSectionRow({
  defaultCollapsed = false,
  userLayout = "standard",
  ...props
}: SpielwieseMessageSectionRowProps & {
  userLayout?: "standard" | "detached";
}) {
  if (getMessageKind(props.section.id) === "assistant") {
    return (
      <SpielwieseAssistantReplySection
        canMoveDown={props.canMoveDown}
        canMoveUp={props.canMoveUp}
        displayLabel={props.displayLabel}
        nodeId={props.nodeId}
        onDelete={() =>
          props.onPromptSectionDelete(props.nodeId, props.section.id)
        }
        onMoveDown={() =>
          props.onPromptSectionMove(props.nodeId, props.section.id, "down")
        }
        onMoveUp={() =>
          props.onPromptSectionMove(props.nodeId, props.section.id, "up")
        }
        onPromptSectionChange={props.onPromptSectionChange}
        receivesValue={props.assistantReceivesValue}
        section={props.section}
        startCollapsed={defaultCollapsed}
      />
    );
  }

  if (
    userLayout === "detached" &&
    getMessageKind(props.section.id) === "user"
  ) {
    return (
      <SpielwieseDetachedUserMessageSectionRow
        {...props}
        startCollapsed={defaultCollapsed}
      />
    );
  }

  return (
    <SpielwieseStandardMessageSectionRow
      {...props}
      defaultCollapsed={defaultCollapsed}
    />
  );
}

function getVisiblePromptSections(
  promptSections: SpielwieseAgentNodeVM["promptSections"],
  includeKinds?: Array<"user" | "system" | "assistant" | "tool">,
) {
  return includeKinds
    ? promptSections.filter((section) =>
        includeKinds.includes(
          getMessageKind(section.id) as
            | "user"
            | "system"
            | "assistant"
            | "tool",
        ),
      )
    : promptSections;
}

function findAssistantReceivesValue(
  promptSections: SpielwieseAgentNodeVM["promptSections"],
  assistantSectionId: string,
) {
  const assistantIndex = promptSections.findIndex(
    (section) => section.id === assistantSectionId,
  );

  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const candidate = promptSections[index];

    if (candidate && getMessageKind(candidate.id) === "user") {
      return candidate.value;
    }
  }

  return promptSections.find((section) => getMessageKind(section.id) === "user")
    ?.value;
}

export function SpielwieseAgentNodePromptSections({
  className,
  includeKinds,
  isCompact = false,
  nodeId,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  promptSections,
  showInsertRow = true,
  toolOptions,
  userLayout = "standard",
}: SpielwieseAgentNodePromptSectionsProps) {
  const visibleSections = getVisiblePromptSections(
    promptSections,
    includeKinds,
  );
  if (visibleSections.length === 0 && !showInsertRow) {
    return null;
  }

  return (
    <div className={cn("grid gap-[7px] pt-1 pb-1", className)}>
      {visibleSections.map((section, index) => (
        <SpielwieseMessageSectionRow
          assistantReceivesValue={findAssistantReceivesValue(
            promptSections,
            section.id,
          )}
          canMoveDown={
            getMessageKind(section.id) !== "system" &&
            index < visibleSections.length - 1
          }
          canMoveUp={
            getMessageKind(section.id) !== "system" &&
            index > 0 &&
            getMessageKind(visibleSections[index - 1]?.id ?? "") !== "system"
          }
          defaultCollapsed={isCompact}
          displayLabel={getPromptSectionDisplayLabel(section.id, section.label)}
          key={`${section.id}-${isCompact ? "compact" : "expanded"}`}
          nodeId={nodeId}
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionMove={onPromptSectionMove}
          section={section}
          toolOptions={toolOptions}
          userLayout={userLayout}
        />
      ))}
      {showInsertRow ? (
        <SpielwieseMessageInsertRow
          nodeId={nodeId}
          onPromptSectionInsert={onPromptSectionInsert}
        />
      ) : null}
    </div>
  );
}
