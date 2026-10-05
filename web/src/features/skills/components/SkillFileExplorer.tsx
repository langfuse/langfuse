import {
  useId,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
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
  Circle,
  CircleDashed,
  File,
  FileCode2,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
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
import { showErrorToast } from "@/src/features/notifications";
import {
  buildSkillFileTree,
  getParentFolderPaths,
  type SkillFileTreeNode,
} from "@/src/features/skills/components/skillFileTree";
import {
  createSkillDraftFile,
  type SkillEditorStore,
} from "@/src/features/skills/components/skillEditorStore";
import { cn } from "@/src/utils/tailwind";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";

type PendingEntry = {
  kind: "file" | "folder";
  parentPath: string;
  name: string;
};

export type SkillFileExplorerState = {
  selectedFolder: string;
  expandedFolders: Set<string>;
  pendingEntry: PendingEntry | null;
};

export function SkillFileExplorer({
  store,
  disabled = false,
  readOnly = false,
  state,
  onStateChange,
  onUpload,
}: {
  store: SkillEditorStore;
  disabled?: boolean;
  readOnly?: boolean;
  state: SkillFileExplorerState;
  onStateChange: Dispatch<SetStateAction<SkillFileExplorerState>>;
  onUpload: () => void;
}) {
  const filePaths = useStore(
    store,
    useShallow((state) => Object.keys(state.files)),
  );
  const folders = useStore(store, (state) => state.folders);
  const activePath = useStore(store, (state) => state.activePath);
  const actions = useStore(store, (state) => state.actions);
  const { selectedFolder, expandedFolders, pendingEntry } = state;
  const setSelectedFolder = (selectedFolder: string) =>
    onStateChange((current) => ({ ...current, selectedFolder }));
  const setPendingEntry = (pendingEntry: PendingEntry | null) =>
    onStateChange((current) => ({ ...current, pendingEntry }));
  const setExpandedFolders = (update: SetStateAction<Set<string>>) =>
    onStateChange((current) => ({
      ...current,
      expandedFolders:
        typeof update === "function" ? update(current.expandedFolders) : update,
    }));
  const isImporting = useStore(store, (state) => state.isImporting);
  const tree = buildSkillFileTree(filePaths, folders);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const moveDisabled = readOnly || disabled || isImporting;

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
    if (moveDisabled) return;
    const parentPath = selectedFolder;
    if (parentPath) {
      setExpandedFolders((current) => new Set([...current, parentPath]));
    }
    setPendingEntry({ kind, parentPath, name: "" });
  };

  const submitEntry = () => {
    if (!pendingEntry || moveDisabled) return;

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

    if (pendingEntry.kind === "file" && filePaths.length >= MAX_SKILL_FILES) {
      showErrorToast(
        "Could not add file",
        `A skill can contain at most ${MAX_SKILL_FILES} files.`,
      );
      return;
    }

    const created =
      pendingEntry.kind === "folder"
        ? actions.addFolder(path)
        : actions.addFile(createSkillDraftFile(path, ""));
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
          <Folder className="text-muted-foreground icon-base shrink-0" />
        ) : (
          <FileCode2 className="text-muted-foreground icon-base shrink-0" />
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
          disabled={moveDisabled}
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
          disabled={moveDisabled}
        >
          <Check className="icon-base" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Cancel new ${label}`}
          onClick={() => setPendingEntry(null)}
        >
          <X className="icon-base" />
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
              store={store}
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
        <aside
          aria-label="Skill files"
          className="ph-no-capture bg-muted/20 relative flex h-full min-w-0 flex-col"
        >
          <div className="flex min-h-11 items-center justify-between gap-2 border-b px-3">
            <SkillFolderDropTarget path="" disabled={moveDisabled}>
              <button
                type="button"
                aria-label="Root folder"
                title="Drop a file here to move it to the root"
                onClick={() => setSelectedFolder("")}
                className="flex items-center gap-2 rounded px-1 py-2 text-sm font-bold"
              >
                <FolderOpen className="icon-base" /> Files
              </button>
            </SkillFolderDropTarget>
            {!readOnly ? (
              <div className="flex items-center gap-0.5">
                <IconButton
                  onClick={onUpload}
                  icon={Upload}
                  label="Upload files or folders"
                  size="sm"
                  disabled={moveDisabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="New file"
                  aria-label="New file"
                  disabled={moveDisabled}
                  onClick={() => startEntry("file")}
                >
                  <FilePlus2 className="icon-base" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="New folder"
                  aria-label="New folder"
                  disabled={moveDisabled}
                  onClick={() => startEntry("folder")}
                >
                  <FolderPlus className="icon-base" />
                </Button>
              </div>
            ) : null}
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
        </aside>
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

const fileChangeIndicators = {
  new: {
    label: "New file",
    icon: Plus,
    className: "text-dark-green h-3.5 w-3.5",
  },
  edited: {
    label: "Edited file",
    icon: Circle,
    className: "text-dark-yellow h-2 w-2 fill-current",
  },
  pending: {
    label: "Checking for changes",
    icon: CircleDashed,
    className: "text-muted-foreground h-3.5 w-3.5",
  },
};

function DraggableSkillFile({
  store,
  path,
  name,
  disabled,
  active,
  onSelect,
  onDelete,
}: {
  store: SkillEditorStore;
  path: string;
  name: string;
  disabled: boolean;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const changeStatusId = useId();
  const changeStatus = useStore(store, (state) => {
    const file = state.files[path];
    if (!file) return null;
    if (file.sourceSha === null) return "new";
    if (file.currentSha === null) return "pending";
    return file.currentSha !== file.sourceSha ? "edited" : null;
  });
  const indicator = changeStatus ? fileChangeIndicators[changeStatus] : null;
  const IndicatorIcon = indicator?.icon;
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
        aria-label={name}
        aria-describedby={
          [
            draggable ? attributes["aria-describedby"] : undefined,
            indicator ? changeStatusId : undefined,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1.5 text-left",
          draggable && "cursor-grab touch-none active:cursor-grabbing",
        )}
      >
        {path.endsWith(".md") ? (
          <FileCode2 className="icon-base shrink-0" />
        ) : (
          <File className="icon-base shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate" title={path}>
          {name}
        </span>
        {indicator && IndicatorIcon ? (
          <Tooltip label={indicator.label}>
            {({ getTriggerProps }) => (
              <span
                {...getTriggerProps()}
                id={changeStatusId}
                role="img"
                aria-label={indicator.label}
                className="flex h-4 w-4 shrink-0 items-center justify-center"
              >
                <IndicatorIcon
                  aria-hidden="true"
                  className={indicator.className}
                />
                <span className="sr-only">{indicator.label}</span>
              </span>
            )}
          </Tooltip>
        ) : null}
      </button>
      {movable && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${path}`}
          onClick={onDelete}
          className="mr-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
        >
          <Trash2 className="icon-base" />
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
              "text-muted-foreground icon-base shrink-0 transition-transform",
              expanded && "rotate-90",
            )}
          />
          {expanded ? (
            <FolderOpen className="icon-base shrink-0" />
          ) : (
            <Folder className="icon-base shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate" title={path}>
            {name}
          </span>
        </button>
        {empty && !disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete folder ${path}`}
            onClick={onDelete}
            className="mr-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
          >
            <Trash2 className="icon-base" />
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
