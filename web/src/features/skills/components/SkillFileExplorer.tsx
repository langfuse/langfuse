import { useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  ChevronRight,
  Check,
  File,
  FileCode2,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Trash2,
  X,
} from "lucide-react";
import { SkillFilePathSchema } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { showErrorToast } from "@/src/features/notifications";
import {
  buildSkillFileTree,
  getParentFolderPaths,
  type SkillFileTreeNode,
} from "@/src/features/skills/components/skillFileTree";
import { type SkillEditorStore } from "@/src/features/skills/components/skillEditorStore";
import { cn } from "@/src/utils/tailwind";

type PendingEntry = {
  kind: "file" | "folder";
  parentPath: string;
  name: string;
};

export function SkillFileExplorer({ store }: { store: SkillEditorStore }) {
  const files = useStore(store, (state) => state.files);
  const folders = useStore(store, (state) => state.folders);
  const activePath = useStore(store, (state) => state.activePath);
  const actions = useStore(store, (state) => state.actions);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [expandedFolders, setExpandedFolders] = useState(
    () => new Set(store.getState().folders),
  );
  const [pendingEntry, setPendingEntry] = useState<PendingEntry | null>(null);
  const tree = buildSkillFileTree(Object.keys(files), folders);

  const toggleFolder = (path: string) => {
    setSelectedFolder(path);
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const startEntry = (kind: PendingEntry["kind"]) => {
    const parentPath = selectedFolder || parentFolder(activePath);
    if (parentPath) {
      setExpandedFolders((current) => new Set([...current, parentPath]));
    }
    setPendingEntry({ kind, parentPath, name: "" });
  };

  const submitEntry = () => {
    if (!pendingEntry) return;

    const name = pendingEntry.name.trim();
    const path = joinPath(pendingEntry.parentPath, name);
    const parsed = SkillFilePathSchema.safeParse(path);
    if (
      !parsed.success ||
      (pendingEntry.kind === "folder" && name.includes("/"))
    ) {
      showErrorToast(
        `Invalid ${pendingEntry.kind} name`,
        pendingEntry.kind === "folder"
          ? "Use a single normalized path segment."
          : "Use a relative file path, such as docs/readme.md.",
      );
      return;
    }

    const created =
      pendingEntry.kind === "folder"
        ? actions.addFolder(path)
        : actions.addFile({
            path,
            content: "",
            contentType: getContentType(path),
          });
    if (!created) {
      showErrorToast(
        `${pendingEntry.kind === "folder" ? "Folder" : "File"} already exists`,
        path,
      );
      return;
    }

    setSelectedFolder(
      pendingEntry.kind === "folder" ? path : parentFolder(path),
    );
    setExpandedFolders(
      (current) =>
        new Set([
          ...current,
          ...getParentFolderPaths([path]),
          ...(pendingEntry.kind === "folder" ? [path] : []),
        ]),
    );
    setPendingEntry(null);
  };

  const renderPendingEntry = (parentPath: string): ReactNode => {
    if (!pendingEntry || pendingEntry.parentPath !== parentPath) return null;
    const label = pendingEntry.kind === "folder" ? "folder" : "file";

    return (
      <form
        className="flex min-w-0 items-center gap-1 py-0.5 pl-1"
        onSubmit={(event) => {
          event.preventDefault();
          submitEntry();
        }}
      >
        {pendingEntry.kind === "folder" ? (
          <Folder className="text-muted-foreground h-4 w-4 shrink-0" />
        ) : (
          <FileCode2 className="text-muted-foreground h-4 w-4 shrink-0" />
        )}
        <Input
          autoFocus
          value={pendingEntry.name}
          onChange={(event) =>
            setPendingEntry({ ...pendingEntry, name: event.target.value })
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") setPendingEntry(null);
          }}
          aria-label={`New ${label} name${parentPath ? ` in ${parentPath}` : ""}`}
          placeholder={
            pendingEntry.kind === "folder" ? "folder-name" : "docs/readme.md"
          }
          className="h-7 min-w-0 px-2 font-mono text-xs"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon-sm"
          aria-label={`Create new ${label}`}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Cancel new ${label}`}
          onClick={() => setPendingEntry(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </form>
    );
  };

  const renderTree = (
    nodes: SkillFileTreeNode[],
    parentPath: string,
  ): ReactNode => (
    <>
      {renderPendingEntry(parentPath)}
      {nodes.map((node) => {
        if (node.kind === "file") {
          return (
            <div
              key={node.path}
              className={cn(
                "group flex w-full items-center rounded text-sm",
                activePath === node.path
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/60",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  actions.selectFile(node.path);
                  setSelectedFolder(parentFolder(node.path));
                }}
                className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1.5 text-left"
              >
                {node.path.endsWith(".md") ? (
                  <FileCode2 className="h-4 w-4 shrink-0" />
                ) : (
                  <File className="h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate" title={node.path}>
                  {node.name}
                </span>
              </button>
              {node.path !== "SKILL.md" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${node.path}`}
                  onClick={() => actions.deleteFile(node.path)}
                  className="mr-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          );
        }

        const isExpanded = expandedFolders.has(node.path);
        const isEmpty = node.children.length === 0;
        return (
          <div key={node.path}>
            <div
              className={cn(
                "group flex w-full items-center rounded text-sm",
                selectedFolder === node.path
                  ? "bg-accent/70 text-accent-foreground"
                  : "hover:bg-accent/60",
              )}
            >
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => toggleFolder(node.path)}
                className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1.5 text-left"
              >
                <ChevronRight
                  className={cn(
                    "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
                {isExpanded ? (
                  <FolderOpen className="h-4 w-4 shrink-0" />
                ) : (
                  <Folder className="h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate" title={node.path}>
                  {node.name}
                </span>
              </button>
              {isEmpty ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete folder ${node.path}`}
                  onClick={() => {
                    if (actions.deleteFolder(node.path)) {
                      setSelectedFolder(parentFolder(node.path));
                    }
                  }}
                  className="mr-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
            {isExpanded ? (
              <div className="border-border/70 ml-3 border-l pl-1.5">
                {renderTree(node.children, node.path)}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );

  return (
    <aside className="ph-no-capture bg-muted/20 flex h-full min-w-0 flex-col">
      <div className="flex min-h-11 items-center justify-between gap-2 border-b px-3">
        <div className="flex items-center gap-2 text-sm font-bold">
          <FolderOpen className="h-4 w-4" /> Files
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="New file"
            aria-label="New file"
            onClick={() => startEntry("file")}
          >
            <FilePlus2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="New folder"
            aria-label="New folder"
            onClick={() => startEntry("folder")}
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">{renderTree(tree, "")}</div>
      <p className="text-muted-foreground border-t px-3 py-2 text-xs leading-4">
        Empty folders stay in this draft until they contain a file.
      </p>
    </aside>
  );
}

function joinPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function parentFolder(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? "" : path.slice(0, separator);
}

function getContentType(path: string): string {
  if (path.endsWith(".md")) return "text/markdown";
  if (path.endsWith(".json")) return "application/json";
  return "text/plain";
}
