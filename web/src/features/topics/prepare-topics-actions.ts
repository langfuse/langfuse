import { type TopicRuleMap } from "./topic-maps";
import {
  CalendarRange,
  Eye,
  History,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  type IconComponent,
} from "@langfuse/icons";

export type AutomaticProcessingState =
  | { status: "unconfigured" }
  | { status: "off" }
  | { status: "on" }
  | { status: "paused"; shortLabel: string };

type TopicAction = {
  id: "edit" | "new-map" | "new-snapshot" | "refresh" | "configure" | "history";
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

const minutesUntil = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

/** Why the selected map can't be refreshed now; undefined when it can. */
export function refreshMapDisabledReason({
  canWrite,
  state,
  rule,
  setupActive,
  now,
}: {
  canWrite: boolean;
  state: AutomaticProcessingState;
  rule: Pick<TopicRuleMap, "enabled" | "refresh">;
  setupActive: boolean;
  now: number;
}) {
  if (!canWrite) return NO_WRITE_ACCESS;
  if (state.status === "paused") return "Topics is paused.";
  if (state.status !== "on")
    return "Turn on automatic processing to refresh this map.";
  if (rule.enabled === false)
    return "Turn on live updates to refresh this map.";
  if (setupActive) return "This map's first topics are still being built.";
  if (rule.refresh.running) return "This map is being refreshed.";
  const availableAt = rule.refresh.availableAt
    ? Date.parse(rule.refresh.availableAt)
    : 0;
  if (availableAt > now)
    return `Refreshed recently. Available again in ${minutesUntil(availableAt - now)} min.`;
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
  refreshMap,
  showUnassigned,
  onShowUnassignedChange,
}: {
  automaticProcessing: { state: AutomaticProcessingState; saving: boolean };
  canWrite: boolean;
  configureAvailable: boolean;
  menuOnly: boolean;
  onConfigure: () => void;
  onHistory: () => void;
  /** Opens New map and New snapshot; disabled without write access. */
  onNewMap?: () => void;
  onNewSnapshot?: () => void;
  /** Why no further map can be created, e.g. the project's limit. */
  mapDisabledReason?: string;
  /** Opens the selected map's settings; absent for snapshots. */
  onEditRun?: () => void;
  /** Refreshes the selected map; absent for snapshots. */
  refreshMap?: { onSelect: () => void; disabledReason?: string };
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
  if (refreshMap)
    menu.push({
      id: "refresh",
      label: "Refresh map",
      icon: RefreshCw,
      disabledReason: refreshMap.disabledReason,
      onSelect: refreshMap.onSelect,
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
  const newMap = onNewMap
    ? {
        onSelect: onNewMap,
        disabledReason: !canWrite
          ? NO_WRITE_ACCESS
          : (createDisabledReason(state) ?? mapDisabledReason),
      }
    : null;
  const newSnapshot = onNewSnapshot
    ? {
        onSelect: onNewSnapshot,
        disabledReason: !canWrite
          ? NO_WRITE_ACCESS
          : createDisabledReason(state),
      }
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
