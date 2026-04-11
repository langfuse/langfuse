import { useState } from "react";
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { cn } from "@/src/utils/tailwind";
import { SpielwieseAssistantReplySection } from "./SpielwieseAssistantReplySection";
import { SpielwieseMessageInsertRow } from "./SpielwieseMessageInsertRow";
import { SpielwieseMessageSectionBody } from "./SpielwieseMessageSectionBody";
import { SpielwieseMessageSectionHeader } from "./SpielwieseMessageSectionHeader";
import type { SpielwieseToolOption } from "./SpielwieseToolMessageSection";
import { getPromptSectionDisplayLabel } from "./spielwiesePromptSectionLabels";
import { getMessageKind } from "./spielwieseMessageTone";

type SpielwieseAgentNodePromptSectionsProps = {
  className?: string;
  includeKinds?: Array<"user" | "system" | "assistant" | "tool">;
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
};

type SpielwieseMessageSectionRowProps = {
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
};

function SpielwieseStandardMessageSectionRow({
  canMoveDown,
  canMoveUp,
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
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "border-border/30 group flex w-full flex-col overflow-hidden border",
        getMessageKind(section.id) === "system" ? "rounded-none" : "rounded-lg",
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
      {isCollapsed ? null : (
        <SpielwieseMessageSectionBody
          nodeId={nodeId}
          onPromptSectionChange={onPromptSectionChange}
          section={section}
          toolOptions={toolOptions}
        />
      )}
    </div>
  );
}

function SpielwieseMessageSectionRow(props: SpielwieseMessageSectionRowProps) {
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
      />
    );
  }

  return <SpielwieseStandardMessageSectionRow {...props} />;
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
  nodeId,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  promptSections,
  showInsertRow = true,
  toolOptions,
}: SpielwieseAgentNodePromptSectionsProps) {
  const visibleSections = getVisiblePromptSections(
    promptSections,
    includeKinds,
  );
  if (visibleSections.length === 0 && !showInsertRow) {
    return null;
  }

  return (
    <div className={cn("grid gap-1 pt-1.5", className)}>
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
          displayLabel={getPromptSectionDisplayLabel(section.id, section.label)}
          key={section.id}
          nodeId={nodeId}
          onPromptSectionChange={onPromptSectionChange}
          onPromptSectionDelete={onPromptSectionDelete}
          onPromptSectionMove={onPromptSectionMove}
          section={section}
          toolOptions={toolOptions}
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
