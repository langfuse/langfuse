/**
 * TraceTree - Composition of VirtualizedTree + TreeNodeWrapper + SpanContent.
 *
 * Connects three layers:
 * - VirtualizedTree (virtualization)
 * - TreeNodeWrapper (tree structure rendering)
 * - SpanContent (span-specific content)
 *
 * This composition pattern allows each component to have a single responsibility.
 */

import { VirtualizedTree } from "./VirtualizedTree";
import { VirtualizedTreeNodeWrapper } from "./VirtualizedTreeNodeWrapper";
import { SpanContent } from "./SpanContent";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useHandlePrefetchObservation } from "@/src/features/traces/hooks/useHandlePrefetchObservation";
import { useSelectTraceNode } from "@/src/features/traces/hooks/useSelectTraceNode";
import { type TreeNode } from "../types/treeNode";
import { metricEmphasisFor } from "@/src/features/traces/fns/metricEmphasis";

import { Lightbulb } from "lucide-react";
import { api } from "@/src/utils/api";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth";
import { useViewPreferences } from "../contexts/ViewPreferencesContext";
import {
  getTraceliftIssuePresentation,
  isTraceliftIssue,
} from "@/src/features/tracelift/issuePresentation";

export function TraceTree() {
  const { roots, comments, metricEmphasis, trace } = useTraceData();
  const { selectedNodeId, collapsedNodes, toggleCollapsed } = useSelection();
  const { handleHover } = useHandlePrefetchObservation();
  const handleSelectNode = useSelectTraceNode("tree");

  const internalFeaturesEnabled = useInternalFeaturesEnabled();
  const isProjectMember = useIsAuthenticatedAndProjectMember(trace.projectId);
  const { isAnnotationMode } = useViewPreferences();
  const showIssues =
    internalFeaturesEnabled && isProjectMember && !isAnnotationMode;
  const issues = api.tracelift.byTrace.useQuery(
    { projectId: trace.projectId, traceId: trace.id, page: 0, limit: 100 },
    { enabled: showIssues },
  );
  const observationIssues = new Map<string, Set<string>>();
  const traceIssues = new Set<string>();
  const observationScopedIssues = new Set<string>();
  for (const issue of showIssues ? (issues.data?.issues ?? []) : []) {
    if (issue.traceId !== trace.id || !isTraceliftIssue(issue.issues)) continue;
    const title = getTraceliftIssuePresentation(issue.issues).title;
    if (!issue.observationId) {
      traceIssues.add(title);
    } else {
      observationScopedIssues.add(title);
      const titles =
        observationIssues.get(issue.observationId) ?? new Set<string>();
      titles.add(title);
      observationIssues.set(issue.observationId, titles);
    }
  }

  // An observation-specific finding takes precedence over its trace-level copy.
  for (const title of observationScopedIssues) traceIssues.delete(title);

  return (
    <>
      {traceIssues.size > 0 && (
        <div
          className="bg-dark-yellow/5 flex items-center gap-2 border-b px-3 py-2 text-xs"
          title={[...traceIssues].join("\n")}
        >
          <Lightbulb
            className="text-dark-yellow size-3.5 shrink-0"
            aria-hidden
          />
          <span>
            {traceIssues.size} Tracelift{" "}
            {traceIssues.size === 1 ? "suggestion" : "suggestions"}
          </span>
        </div>
      )}
      {showIssues && issues.data?.hasMore && (
        <p className="text-muted-foreground px-3 py-1 text-xs">
          Highlights cover the latest 100 findings. More findings are available
          in trace Preview.
        </p>
      )}
      <VirtualizedTree
        roots={roots}
        collapsedNodes={collapsedNodes}
        selectedNodeId={selectedNodeId}
        onToggleCollapse={toggleCollapsed}
        onSelectNode={handleSelectNode}
        renderNode={({
          node,
          treeMetadata,
          isSelected,
          isCollapsed,
          onToggleCollapse,
          onSelect,
        }) => {
          const typedNode = node as TreeNode;
          const suggestions =
            typedNode.type === "TRACE"
              ? undefined
              : observationIssues.get(typedNode.id);
          const suggestionLabel = suggestions
            ? `Instrumentation suggestions: ${[...suggestions].join("; ")}`
            : undefined;

          return (
            <VirtualizedTreeNodeWrapper
              className={
                suggestions && !isSelected ? "bg-dark-yellow/5" : undefined
              }
              metadata={treeMetadata}
              nodeType={typedNode.type}
              hasChildren={typedNode.children.length > 0}
              isCollapsed={isCollapsed}
              onToggleCollapse={onToggleCollapse}
              isSelected={isSelected}
              onSelect={onSelect}
            >
              {suggestionLabel && (
                <span
                  title={suggestionLabel}
                  aria-label={suggestionLabel}
                  className="text-dark-yellow flex shrink-0 items-center px-1"
                >
                  <Lightbulb className="size-3.5" aria-hidden />
                </span>
              )}
              <SpanContent
                node={typedNode}
                emphasis={metricEmphasisFor(typedNode, metricEmphasis)}
                commentCount={comments.get(typedNode.id)}
                onSelect={onSelect}
                onHover={() => handleHover(typedNode)}
              />
            </VirtualizedTreeNodeWrapper>
          );
        }}
      />
    </>
  );
}
