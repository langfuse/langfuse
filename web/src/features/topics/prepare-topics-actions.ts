import {
  CalendarRange,
  Eye,
  History,
  Pencil,
  Plus,
  Settings,
  type IconComponent,
} from "@langfuse/icons";

export type AutomaticProcessingState =
  | { status: "unconfigured" }
  | { status: "off" }
  | { status: "on" }
  | { status: "paused"; shortLabel: string };

type TopicAction = {
  id: "edit" | "new-map" | "new-snapshot" | "configure" | "history";
  label: string;
  icon: IconComponent;
  onSelect: () => void;
  disabledReason?: string;
  badge?: string;
};

const NO_WRITE_ACCESS = "You need permission to edit Topics.";

function createDisabledReason(state: AutomaticProcessingState) {
  if (state.status === "unconfigured") return "Set up Topics first.";
  return undefined;
}

/** One action policy for the Edit map button and both overflow-menu presentations. */
export function prepareTopicsActions({
  automaticProcessing,
  canWrite,
  configureAvailable,
  menuOnly,
  onConfigure,
  onHistory,
  onNewMap,
  onNewSnapshot,
  mapDisabledReason,
  onEditRun,
  showUnassigned,
  onShowUnassignedChange,
}: {
  automaticProcessing: { state: AutomaticProcessingState; saving: boolean };
  canWrite: boolean;
  configureAvailable: boolean;
  menuOnly: boolean;
  onConfigure: () => void;
  onHistory: () => void;
  /** Opens New map and New snapshot; hidden without write access. */
  onNewMap?: () => void;
  onNewSnapshot?: () => void;
  /** Why no further map can be created, e.g. the project's limit. */
  mapDisabledReason?: string;
  /** Opens the selected map's settings; absent for snapshots. */
  onEditRun?: () => void;
  showUnassigned: boolean;
  onShowUnassignedChange: (show: boolean) => void;
}) {
  const { state } = automaticProcessing;
  const editDisabledReason = canWrite ? undefined : NO_WRITE_ACCESS;
  const menu: TopicAction[] = [];
  // Handheld headers show only the menu, so it carries Edit map there.
  if (onEditRun && menuOnly)
    menu.push({
      id: "edit",
      label: "Edit map",
      icon: Pencil,
      disabledReason: editDisabledReason,
      onSelect: onEditRun,
    });
  menu.push(
    {
      id: "history",
      label: "History",
      icon: History,
      onSelect: onHistory,
    },
    {
      id: "configure",
      label: "Settings",
      icon: Settings,
      disabledReason: configureAvailable
        ? undefined
        : "Topics settings are still loading.",
      onSelect: onConfigure,
    },
  );
  const display = {
    id: "show-unassigned",
    label: "Show unassigned",
    icon: Eye,
    checked: showUnassigned,
    onCheckedChange: onShowUnassignedChange,
  } as const;
  // Without write access, creating is hidden rather than disabled.
  const disabledReason = createDisabledReason(state);
  const newMap =
    onNewMap && canWrite
      ? {
          onSelect: onNewMap,
          disabledReason: disabledReason ?? mapDisabledReason,
        }
      : null;
  const newSnapshot =
    onNewSnapshot && canWrite
      ? { onSelect: onNewSnapshot, disabledReason }
      : null;
  if (newSnapshot)
    menu.unshift({
      id: "new-snapshot",
      label: "New snapshot",
      icon: CalendarRange,
      ...newSnapshot,
    });
  if (newMap)
    menu.unshift({
      id: "new-map",
      label: "New map",
      icon: Plus,
      ...newMap,
    });
  const editRun =
    onEditRun && !menuOnly
      ? { onSelect: onEditRun, disabledReason: editDisabledReason }
      : null;
  return {
    editRun,
    newMap,
    newSnapshot,
    menu,
    display,
  };
}

export type TopicsActions = ReturnType<typeof prepareTopicsActions>;
