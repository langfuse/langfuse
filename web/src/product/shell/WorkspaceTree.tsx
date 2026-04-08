import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
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
  const hasChildren = Boolean(node.children?.length);
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
  const isNested = depth > 0;
  const [isOpen, setIsOpen] = useState(
    depth === 0 || isActive || hasActiveChild,
  );

  useEffect(() => {
    if (isActive || hasActiveChild) {
      setIsOpen(true);
    }
  }, [hasActiveChild, isActive]);

  if (!hasChildren) {
    return (
      <div className={cn(isNested ? "space-y-0.5" : "space-y-1")}>
        <Link
          href={getNodeHref(projectId, node)}
          className={cn(
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center transition-colors",
            isNested
              ? "min-h-8 gap-1.5 rounded-md px-1.5 text-sm"
              : "min-h-9 gap-2 rounded-lg px-2 text-sm",
            isActive &&
              "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
            !isActive && hasActiveChild && "text-foreground",
          )}
        >
          <div className="w-3.5 shrink-0" />
          <Icon className="text-sidebar-foreground/70 h-4 w-4 shrink-0" />
          <span className="truncate">{humanizeSegment(node.name)}</span>
        </Link>
      </div>
    );
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(isNested ? "space-y-0.5" : "space-y-1")}
    >
      <div
        className={cn(
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center transition-colors",
          isNested
            ? "min-h-8 gap-1.5 rounded-md px-1.5 text-sm"
            : "min-h-9 gap-2 rounded-lg px-2 text-sm",
          isActive &&
            "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
          !isActive && hasActiveChild && "text-foreground",
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-label={`Toggle ${humanizeSegment(node.name)} folder`}
            className="text-sidebar-foreground/55 hover:text-sidebar-foreground flex h-5 w-3.5 shrink-0 items-center justify-center"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                isOpen && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <Link
          href={getNodeHref(projectId, node)}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <Icon className="text-sidebar-foreground/70 h-4 w-4 shrink-0" />
          <span className="truncate">{humanizeSegment(node.name)}</span>
        </Link>
      </div>
      <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down origin-top overflow-hidden will-change-[height,opacity,transform]">
        <div className="border-sidebar-border/60 mt-1 ml-3 space-y-0.5 border-l pl-0.5">
          {node.children?.map((child) => (
            <WorkspaceTreeNode
              key={child.pathSegments.join("/")}
              node={child}
              projectId={projectId}
              depth={depth + 1}
              selection={selection}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
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
