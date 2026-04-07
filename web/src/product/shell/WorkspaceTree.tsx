import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/src/components/ui/sidebar";
import { cn } from "@/src/utils/tailwind";
import {
  type WorkspaceNodeKind,
  type WorkspacePreviewNode,
  getDatasetPreviewHref,
  getFolderPreviewHref,
  getPromptStageHref,
  getTreeIcon,
  getWorkspacePreviewNodes,
  humanizeSegment,
} from "./product-manifest";

export type WorkspaceSelection = {
  kind: WorkspaceNodeKind;
  path: string[];
} | null;

export function WorkspaceTree({
  projectId,
  selection,
}: {
  projectId: string;
  selection: WorkspaceSelection;
}) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="text-sidebar-foreground/70">
        Workspace
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="space-y-1 px-2">
          {getWorkspacePreviewNodes().map((node) => (
            <WorkspaceTreeNode
              key={node.pathSegments.join("/")}
              node={node}
              projectId={projectId}
              depth={0}
              selection={selection}
            />
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function WorkspaceTreeNode({
  node,
  projectId,
  depth,
  selection,
}: {
  node: WorkspacePreviewNode;
  projectId: string;
  depth: number;
  selection: WorkspaceSelection;
}) {
  const Icon = getTreeIcon(node.kind);
  const isActive =
    selection?.kind === node.kind &&
    selection.path.join("/") === node.pathSegments.join("/");
  const hasActiveChild = Boolean(
    node.children?.some((child) =>
      selection
        ? selection.path.join("/").startsWith(child.pathSegments.join("/"))
        : false,
    ),
  );

  return (
    <div className="space-y-1">
      <Link
        href={getNodeHref(projectId, node)}
        className={cn(
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm transition-colors",
          isActive &&
            "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
          !isActive && hasActiveChild && "text-foreground",
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {node.kind === "folder" ? (
          <ChevronDown className="text-sidebar-foreground/55 h-3.5 w-3.5 shrink-0" />
        ) : (
          <div className="w-3.5 shrink-0" />
        )}
        <Icon className="text-sidebar-foreground/70 h-4 w-4 shrink-0" />
        <span className="truncate">{humanizeSegment(node.name)}</span>
      </Link>
      {node.children?.length ? (
        <div className="border-sidebar-border/60 ml-4 space-y-1 border-l pl-1">
          {node.children.map((child) => (
            <WorkspaceTreeNode
              key={child.pathSegments.join("/")}
              node={child}
              projectId={projectId}
              depth={depth + 1}
              selection={selection}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getNodeHref(projectId: string, node: WorkspacePreviewNode) {
  switch (node.kind) {
    case "folder":
      return getFolderPreviewHref(projectId, node.pathSegments);
    case "dataset":
      return getDatasetPreviewHref(projectId, node.pathSegments);
    case "prompt":
    default:
      return getPromptStageHref(projectId, node.pathSegments, "iterate");
  }
}
