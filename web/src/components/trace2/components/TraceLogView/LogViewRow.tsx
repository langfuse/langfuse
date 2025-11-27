/**
 * LogViewRow - Container component for log view rows.
 *
 * Thin wrapper that delegates to Preview or Expanded based on state.
 * All state is managed by parent - this component is props-driven.
 */

import { memo } from "react";
import { type FlatLogItem, type LogViewTreeStyle } from "./log-view-types";
import { LogViewRowPreview } from "./LogViewRowPreview";
import { LogViewRowExpanded } from "./LogViewRowExpanded";

export interface LogViewRowProps {
  item: FlatLogItem;
  isExpanded: boolean;
  onToggle: (nodeId: string) => void;
  treeStyle: LogViewTreeStyle;
  traceId: string;
  projectId: string;
}

/**
 * Container component for log view rows.
 * Renders Preview (collapsed) or Expanded based on isExpanded prop.
 */
export const LogViewRow = memo(
  function LogViewRow({
    item,
    isExpanded,
    onToggle,
    treeStyle,
    traceId,
    projectId,
  }: LogViewRowProps) {
    const handleExpand = () => onToggle(item.node.id);
    const handleCollapse = () => onToggle(item.node.id);

    if (isExpanded) {
      return (
        <LogViewRowExpanded
          node={item.node}
          traceId={traceId}
          projectId={projectId}
          onCollapse={handleCollapse}
        />
      );
    }

    return (
      <LogViewRowPreview
        node={item.node}
        treeLines={item.treeLines}
        isLastSibling={item.isLastSibling}
        treeStyle={treeStyle}
        onExpand={handleExpand}
      />
    );
  },
  // Custom comparison to prevent unnecessary re-renders
  (prevProps, nextProps) => {
    return (
      prevProps.item.node.id === nextProps.item.node.id &&
      prevProps.isExpanded === nextProps.isExpanded &&
      prevProps.treeStyle === nextProps.treeStyle &&
      prevProps.traceId === nextProps.traceId &&
      prevProps.projectId === nextProps.projectId
    );
  },
);
