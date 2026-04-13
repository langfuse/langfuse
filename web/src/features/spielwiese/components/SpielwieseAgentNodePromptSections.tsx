/* eslint-disable max-lines */
import type { SpielwieseAgentNodeVM } from "../types/dashboard";
import { cn } from "@/src/utils/tailwind";
import { SpielwieseAssistantReplySection } from "./SpielwieseAssistantReplySection";
import { SpielwieseDetachedUserMessageSectionRow } from "./SpielwieseDetachedUserMessageSectionRow";
import { SpielwieseMessageInsertRow } from "./SpielwieseMessageInsertRow";
import type { SpielwieseToolOption } from "./SpielwieseToolMessageSection";
import { getPromptSectionDisplayLabel } from "./spielwiesePromptSectionLabels";
import { SpielwieseStandardMessageSectionRow } from "./SpielwieseStandardMessageSectionRow";
import { getMessageKind } from "./spielwieseMessageTone";

type SpielwieseAgentNodePromptSectionsProps = {
  className?: string;
  includeKinds?: Array<"user" | "system" | "assistant" | "tool">;
  isCompact?: boolean;
  isPreviewFocused?: boolean;
  nodeId: string;
  onAgentNodeArchive?: (nodeId: string) => void;
  onPreviewHoverEnd?: () => void;
  onPreviewHoverStart?: () => void;
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
  onToggleCompact?: () => void;
  onTogglePreviewFocus?: () => void;
  insertSurface?: "bare" | "framed";
  promptSections: SpielwieseAgentNodeVM["promptSections"];
  rowTopPadding?: "default" | "none";
  showInsertRow?: boolean;
  spacing?: "default" | "flush";
  toolOptions: SpielwieseToolOption[];
  userLayout?: "standard" | "detached";
};

type SpielwieseMessageSectionRowProps = {
  assistantReceivesValue?: string;
  canMoveDown: boolean;
  canMoveUp: boolean;
  defaultCollapsed?: boolean;
  displayLabel: string;
  isCompact?: boolean;
  isPreviewFocused?: boolean;
  nodeId: string;
  onAgentNodeArchive?: SpielwieseAgentNodePromptSectionsProps["onAgentNodeArchive"];
  onPreviewHoverEnd?: SpielwieseAgentNodePromptSectionsProps["onPreviewHoverEnd"];
  onPreviewHoverStart?: SpielwieseAgentNodePromptSectionsProps["onPreviewHoverStart"];
  onPromptSectionChange: SpielwieseAgentNodePromptSectionsProps["onPromptSectionChange"];
  onPromptSectionDelete: SpielwieseAgentNodePromptSectionsProps["onPromptSectionDelete"];
  onPromptSectionMove: SpielwieseAgentNodePromptSectionsProps["onPromptSectionMove"];
  onToggleCompact?: SpielwieseAgentNodePromptSectionsProps["onToggleCompact"];
  onTogglePreviewFocus?: SpielwieseAgentNodePromptSectionsProps["onTogglePreviewFocus"];
  rowTopPadding?: "default" | "none";
  section: SpielwieseAgentNodeVM["promptSections"][number];
  toolOptions: SpielwieseToolOption[];
};

function SpielwieseMessageSectionRow({
  defaultCollapsed = false,
  rowTopPadding = "default",
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
        isCompact={props.isCompact}
        isPreviewFocused={props.isPreviewFocused}
        onPreviewHoverEnd={props.onPreviewHoverEnd}
        onPreviewHoverStart={props.onPreviewHoverStart}
        onToggleCompact={props.onToggleCompact}
        onTogglePreviewFocus={props.onTogglePreviewFocus}
        startCollapsed={defaultCollapsed}
      />
    );
  }

  return (
    <SpielwieseStandardMessageSectionRow
      {...props}
      defaultCollapsed={defaultCollapsed}
      rowTopPadding={rowTopPadding}
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

function getPromptSectionsClassName({
  className,
  spacing,
}: Pick<SpielwieseAgentNodePromptSectionsProps, "className" | "spacing">) {
  return cn(
    "grid",
    spacing === "flush" ? "gap-0 pt-0 pb-0" : "gap-[7px] pt-1 pb-1",
    className,
  );
}

function shouldHidePromptSections({
  showInsertRow,
  visibleSections,
}: {
  showInsertRow: boolean;
  visibleSections: SpielwieseAgentNodeVM["promptSections"];
}) {
  return visibleSections.length === 0 && !showInsertRow;
}

// eslint-disable-next-line max-lines-per-function
function renderPromptSectionRows({
  isCompact,
  isPreviewFocused,
  nodeId,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionMove,
  onAgentNodeArchive,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  promptSections,
  rowTopPadding,
  toolOptions,
  userLayout,
  onToggleCompact,
  onTogglePreviewFocus,
  visibleSections,
}: Pick<
  SpielwieseAgentNodePromptSectionsProps,
  | "isCompact"
  | "isPreviewFocused"
  | "nodeId"
  | "onAgentNodeArchive"
  | "onPreviewHoverEnd"
  | "onPreviewHoverStart"
  | "onPromptSectionChange"
  | "onPromptSectionDelete"
  | "onPromptSectionMove"
  | "onToggleCompact"
  | "onTogglePreviewFocus"
  | "promptSections"
  | "rowTopPadding"
  | "toolOptions"
  | "userLayout"
> & {
  visibleSections: SpielwieseAgentNodeVM["promptSections"];
}) {
  return visibleSections.map((section, index) => (
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
      isCompact={isCompact}
      isPreviewFocused={isPreviewFocused}
      key={`${section.id}-${isCompact ? "compact" : "expanded"}`}
      nodeId={nodeId}
      onAgentNodeArchive={onAgentNodeArchive}
      onPreviewHoverEnd={onPreviewHoverEnd}
      onPreviewHoverStart={onPreviewHoverStart}
      onPromptSectionChange={onPromptSectionChange}
      onPromptSectionDelete={onPromptSectionDelete}
      onPromptSectionMove={onPromptSectionMove}
      onToggleCompact={onToggleCompact}
      onTogglePreviewFocus={onTogglePreviewFocus}
      rowTopPadding={rowTopPadding}
      section={section}
      toolOptions={toolOptions}
      userLayout={userLayout}
    />
  ));
}

// eslint-disable-next-line complexity
export function SpielwieseAgentNodePromptSections({
  className,
  includeKinds,
  isCompact = false,
  isPreviewFocused = false,
  nodeId,
  onAgentNodeArchive,
  onPreviewHoverEnd,
  onPreviewHoverStart,
  onPromptSectionChange,
  onPromptSectionDelete,
  onPromptSectionInsert,
  onPromptSectionMove,
  onToggleCompact,
  onTogglePreviewFocus,
  insertSurface = "framed",
  promptSections,
  rowTopPadding = "default",
  showInsertRow = true,
  spacing = "default",
  toolOptions,
  userLayout = "standard",
}: SpielwieseAgentNodePromptSectionsProps) {
  const visibleSections = getVisiblePromptSections(
    promptSections,
    includeKinds,
  );
  if (shouldHidePromptSections({ showInsertRow, visibleSections })) {
    return null;
  }

  return (
    <div className={getPromptSectionsClassName({ className, spacing })}>
      {renderPromptSectionRows({
        isCompact,
        isPreviewFocused,
        nodeId,
        onAgentNodeArchive,
        onPreviewHoverEnd,
        onPreviewHoverStart,
        onPromptSectionChange,
        onPromptSectionDelete,
        onPromptSectionMove,
        onToggleCompact,
        onTogglePreviewFocus,
        promptSections,
        rowTopPadding,
        toolOptions,
        userLayout,
        visibleSections,
      })}
      {showInsertRow && !isCompact ? (
        <SpielwieseMessageInsertRow
          nodeId={nodeId}
          onPromptSectionInsert={onPromptSectionInsert}
          surface={insertSurface}
        />
      ) : null}
    </div>
  );
}
