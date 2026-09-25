import { useId, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
  Upload,
  X,
} from "lucide-react";
import {
  MAX_SKILL_FILES,
  SkillFilePathSchema,
  SkillVersionFileInputSchema,
} from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { DropzoneController } from "@/src/components/design-system/DropzoneController/DropzoneController";
import { showErrorToast } from "@/src/features/notifications";
import { importSkillFiles } from "@/src/features/skills/actions/importSkillFiles";
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

export function SkillFileExplorer({
  store,
  disabled = false,
}: {
  store: SkillEditorStore;
  disabled?: boolean;
}) {
  const files = useStore(store, (state) => state.files);
  const folders = useStore(store, (state) => state.folders);
  const activePath = useStore(store, (state) => state.activePath);
  const actions = useStore(store, (state) => state.actions);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [expandedFolders, setExpandedFolders] = useState(
    () => new Set(store.getState().folders),
  );
  const [pendingEntry, setPendingEntry] = useState<PendingEntry | null>(null);
  const isImporting = useStore(store, (state) => state.isImporting);
  const tree = buildSkillFileTree(Object.keys(files), folders);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const moveDisabled = disabled || isImporting;

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const path = active.data.current?.path;
    const targetFolder = over?.data.current?.path;
    if (
      moveDisabled ||
      typeof path !== "string" ||
      typeof targetFolder !== "string"
    )
      return;
    const isFolder = active.data.current?.kind === "folder";
    const moved = isFolder
      ? actions.moveFolder(path, targetFolder)
      : actions.moveFile(path, targetFolder);
    if (!moved) {
      showErrorToast(
        `Could not move ${isFolder ? "folder" : "file"}`,
        "The destination conflicts with an existing file or folder, or the move is invalid.",
      );
      return;
    }
    const nextPath = joinPath(targetFolder, path.split("/").at(-1)!);
    setSelectedFolder(isFolder ? nextPath : targetFolder);
    setExpandedFolders(
      (current) =>
        new Set([
          ...[...current].map((folder) =>
            isFolder && (folder === path || folder.startsWith(`${path}/`))
              ? `${nextPath}${folder.slice(path.length)}`
              : folder,
          ),
          ...(targetFolder ? [targetFolder] : []),
        ]),
    );
    setPendingEntry(null);
  };

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
    const parentPath = selectedFolder;
    if (parentPath) {
      setExpandedFolders((current) => new Set([...current, parentPath]));
    }
    setPendingEntry({ kind, parentPath, name: "" });
  };

  const submitEntry = () => {
    if (!pendingEntry) return;

    const name = pendingEntry.name.trim();
    const path = joinPath(pendingEntry.parentPath, name);
    const parsed =
      pendingEntry.kind === "folder"
        ? SkillFilePathSchema.safeParse(path)
        : SkillVersionFileInputSchema.safeParse({ path, content: "" });
    if (
      !parsed.success ||
      (pendingEntry.kind === "folder" && name.includes("/"))
    ) {
      const validationMessage = !parsed.success
        ? parsed.error.issues[0]?.message
        : "Use a relative file path, such as docs/readme.md.";
      showErrorToast(
        `Invalid ${pendingEntry.kind} name`,
        pendingEntry.kind === "folder"
          ? "Use a single normalized path segment."
          : validationMessage,
      );
      return;
    }

    if (
      pendingEntry.kind === "file" &&
      Object.keys(files).length >= MAX_SKILL_FILES
    ) {
      showErrorToast(
        "Could not add file",
        `A skill can contain at most ${MAX_SKILL_FILES} files.`,
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
            <DraggableSkillFile
              key={node.path}
              path={node.path}
              name={node.name}
              disabled={moveDisabled}
              active={activePath === node.path}
              onSelect={() => {
                actions.selectFile(node.path);
                setSelectedFolder(parentFolder(node.path));
              }}
              onDelete={() => actions.deleteFile(node.path)}
            />
          );
        }

        const isExpanded = expandedFolders.has(node.path);
        const isEmpty = node.children.length === 0;
        return (
          <div key={node.path}>
            <DraggableSkillFolder
              path={node.path}
              name={node.name}
              disabled={moveDisabled}
              selected={selectedFolder === node.path}
              expanded={isExpanded}
              empty={isEmpty}
              onToggle={() => toggleFolder(node.path)}
              onDelete={() => {
                if (actions.deleteFolder(node.path)) {
                  setSelectedFolder(parentFolder(node.path));
                }
              }}
            />
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
    <div className="ph-no-capture h-full">
      <DndContext
        sensors={sensors}
        collisionDetection={skillMoveCollisionDetection}
        onDragEnd={handleDragEnd}
      >
        <DropzoneController
          noClick
          noKeyboard
          isDisabled={disabled || isImporting}
          onError={(error) =>
            showErrorToast("Could not add files", error.message)
          }
          onProcessingChange={(isImporting) => store.setState({ isImporting })}
          onDrop={async (droppedFiles) => {
            const paths = await importSkillFiles(store, droppedFiles);
            setExpandedFolders(
              (current) =>
                new Set([...current, ...getParentFolderPaths(paths)]),
            );
            setSelectedFolder("");
            setPendingEntry(null);
          }}
        >
          {({
            getRootProps,
            getInputProps,
            isDragActive,
            open,
            openDirectory,
          }) => (
            <aside
              {...getRootProps({
                role: "region",
                "aria-label": "Skill files",
                className: cn(
                  "ph-no-capture bg-muted/20 relative flex h-full min-w-0 flex-col",
                  isDragActive && "ring-primary ring-2 ring-inset",
                ),
              })}
            >
              <input {...getInputProps()} aria-label="Add files to draft" />
              <div className="flex min-h-11 items-center justify-between gap-2 border-b px-3">
                <SkillFolderDropTarget path="" disabled={moveDisabled}>
                  <button
                    type="button"
                    aria-label="Root folder"
                    title="Drop a file here to move it to the root"
                    onClick={() => setSelectedFolder("")}
                    className="flex items-center gap-2 rounded px-1 py-2 text-sm font-bold"
                  >
                    <FolderOpen className="h-4 w-4" /> Files
                  </button>
                </SkillFolderDropTarget>
                <div className="flex items-center gap-0.5">
                  <DropdownMenu
                    disabled={disabled || isImporting}
                    items={[
                      {
                        id: "files",
                        type: "item",
                        title: "Add files",
                        icon: FilePlus2,
                        onClick: open,
                      },
                      {
                        id: "folder",
                        type: "item",
                        title: "Add folder",
                        icon: FolderPlus,
                        onClick: openDirectory,
                      },
                    ]}
                  >
                    {({ getTriggerProps }) => (
                      <IconButton
                        {...getTriggerProps()}
                        icon={Upload}
                        label="Upload files or folder"
                        size="sm"
                        disabled={disabled || isImporting}
                      />
                    )}
                  </DropdownMenu>
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
              <div className="flex flex-1 flex-col overflow-y-auto p-2">
                {renderTree(tree, "")}
                <SkillFolderDropTarget
                  path=""
                  disabled={moveDisabled}
                  variant="empty-space"
                />
              </div>
              {isImporting ? (
                <p className="text-muted-foreground border-t px-3 py-2 text-xs leading-4">
                  Adding files to draft…
                </p>
              ) : null}
              {isDragActive ? (
                <div className="bg-background/90 pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-sm font-bold">
                  Drop files or folders to add to draft
                </div>
              ) : null}
            </aside>
          )}
        </DropzoneController>
      </DndContext>
    </div>
  );
}

const skillMoveCollisionDetection: CollisionDetection = (args) => {
  const source = args.active.data.current;
  const droppableContainers = args.droppableContainers.filter((container) => {
    const target = container.data.current?.path;
    return (
      source?.kind !== "folder" ||
      (target !== source.path && !target?.startsWith(`${source.path}/`))
    );
  });
  const candidates = { ...args, droppableContainers };
  return args.pointerCoordinates
    ? pointerWithin(candidates)
    : rectIntersection(candidates);
};

function DraggableSkillFile({
  path,
  name,
  disabled,
  active,
  onSelect,
  onDelete,
}: {
  path: string;
  name: string;
  disabled: boolean;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const movable = path !== "SKILL.md";
  const draggable = movable && !disabled;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `file:${path}`,
    data: { path },
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "group relative flex w-full items-center rounded text-sm",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
        isDragging && "z-1 opacity-60",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...(draggable ? attributes : {})}
        {...(draggable ? listeners : {})}
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1.5 text-left",
          draggable && "cursor-grab touch-none active:cursor-grabbing",
        )}
      >
        {path.endsWith(".md") ? (
          <FileCode2 className="h-4 w-4 shrink-0" />
        ) : (
          <File className="h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate" title={path}>
          {name}
        </span>
      </button>
      {movable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${path}`}
          onClick={onDelete}
          className="mr-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

function DraggableSkillFolder({
  path,
  name,
  disabled,
  selected,
  expanded,
  empty,
  onToggle,
  onDelete,
}: {
  path: string;
  name: string;
  disabled: boolean;
  selected: boolean;
  expanded: boolean;
  empty: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `folder-drag:${path}`,
    data: { path, kind: "folder" },
    disabled,
  });
  return (
    <SkillFolderDropTarget path={path} disabled={disabled}>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform) }}
        className={cn(
          "group relative flex w-full items-center rounded text-sm",
          selected
            ? "bg-accent/70 text-accent-foreground"
            : "hover:bg-accent/60",
          isDragging && "z-1 opacity-60",
        )}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...(disabled ? {} : attributes)}
          {...(disabled ? {} : listeners)}
          aria-expanded={expanded}
          onClick={onToggle}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1 px-1 py-1.5 text-left",
            !disabled && "cursor-grab touch-none active:cursor-grabbing",
          )}
        >
          <ChevronRight
            className={cn(
              "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform",
              expanded && "rotate-90",
            )}
          />
          {expanded ? (
            <FolderOpen className="h-4 w-4 shrink-0" />
          ) : (
            <Folder className="h-4 w-4 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate" title={path}>
            {name}
          </span>
        </button>
        {empty ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete folder ${path}`}
            onClick={onDelete}
            className="mr-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </SkillFolderDropTarget>
  );
}

function SkillFolderDropTarget({
  path,
  disabled,
  variant = "row",
  children,
}: {
  path: string;
  disabled: boolean;
  variant?: "row" | "empty-space";
  children?: ReactNode;
}) {
  const id = useId();
  const { setNodeRef, isOver } = useDroppable({
    id: `folder:${id}`,
    data: { path },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded",
        isOver && "ring-primary ring-2 ring-inset",
        variant === "empty-space" && "min-h-16 flex-1",
      )}
    >
      {children}
    </div>
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
