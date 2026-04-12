import type { ReactNode } from "react";
import { SpielwieseMessageSectionActions } from "./SpielwieseMessageSectionActions";

export function getMessageSectionRevealClassName(
  revealMode: "agent-node" | "section",
) {
  return revealMode === "agent-node"
    ? "pointer-events-none opacity-0 transition-all group-focus-within/agent-node:pointer-events-auto group-focus-within/agent-node:opacity-100 group-hover/agent-node:pointer-events-auto group-hover/agent-node:opacity-100"
    : "";
}

export function SpielwieseMessageSectionTrailing({
  canMoveDown,
  canMoveUp,
  controlRevealMode,
  label,
  nodeId,
  onDelete,
  onMoveDown,
  onMoveUp,
  sectionId,
  trailingAccessory,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  controlRevealMode?: "agent-node" | "section";
  label: string;
  nodeId: string;
  onDelete: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  sectionId: string;
  trailingAccessory?: ReactNode;
}) {
  const trailingAccessoryClassName = getMessageSectionRevealClassName(
    controlRevealMode ?? "section",
  );

  return (
    <div className="flex shrink-0 items-center gap-1">
      <SpielwieseMessageSectionActions
        canMoveDown={canMoveDown}
        canMoveUp={canMoveUp}
        nodeId={nodeId}
        onDelete={onDelete}
        onMoveDown={onMoveDown}
        onMoveUp={onMoveUp}
        revealMode={controlRevealMode}
        sectionId={sectionId}
        sectionLabel={label}
      />
      {trailingAccessory ? (
        <div className={trailingAccessoryClassName}>{trailingAccessory}</div>
      ) : null}
    </div>
  );
}
