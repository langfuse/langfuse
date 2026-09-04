import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import type { ProjectMigrationReadiness } from "@/src/features/v4-migration/migrationData";
import { useQueryProject } from "@/src/features/projects/hooks";

export type V4MigrationTargetProject = {
  id: string;
  name: string;
  readiness?: ProjectMigrationReadiness;
};

/** Which surface opened the panel; the funnel's entry dimension. */
export type V4MigrationPanelOpenSource =
  | "delay_badge"
  | "status_page_row"
  | "sidebar_card"
  | "project_chip";

type V4MigrationPanelContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Project the panel content is about; set by whichever surface opened it. */
  targetProject: V4MigrationTargetProject | null;
  openForProject: (
    project: V4MigrationTargetProject,
    source: V4MigrationPanelOpenSource,
  ) => void;
};

const V4MigrationPanelContext =
  createContext<V4MigrationPanelContextType | null>(null);

interface V4MigrationPanelProviderProps extends PropsWithChildren {
  defaultOpen?: boolean;
}

// V4MigrationPanelProvider to allow us to open the panel from anywhere in the app
export function V4MigrationPanelProvider({
  children,
  defaultOpen = false,
}: V4MigrationPanelProviderProps) {
  const { project: routeProject } = useQueryProject();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(routeProject?.id);
  const capture = usePostHogClientCapture();
  const [requestedOpen, setRequestedOpen] = useState(defaultOpen);
  const [targetProject, setTargetProject] =
    useState<V4MigrationTargetProject | null>(null);

  const open = v4UpgradeUiEnabled && requestedOpen;
  const setOpen = (nextOpen: boolean) => {
    setRequestedOpen(v4UpgradeUiEnabled && nextOpen);
  };
  // Every open path goes through here (setOpen callers only ever close), so
  // this is the single funnel-entry event. A redundant open of the same
  // project does not double-count, but retargeting the open panel to a
  // different project is a new funnel entry.
  const openForProject = (
    project: V4MigrationTargetProject,
    source: V4MigrationPanelOpenSource,
  ) => {
    if (!v4UpgradeUiEnabled) return;
    if (!open || project.id !== targetProject?.id)
      capture("v4_migration:panel_opened", { source });
    // Entry points that only appear for actionable projects may omit readiness.
    // Normalize them here so a later route change can distinguish that known
    // state from an unrelated project whose readiness has not been loaded.
    setTargetProject({
      ...project,
      readiness: project.readiness ?? "action-needed",
    });
    setRequestedOpen(true);
  };

  return (
    <V4MigrationPanelContext.Provider
      value={{ open, setOpen, targetProject, openForProject }}
    >
      {children}
    </V4MigrationPanelContext.Provider>
  );
}

export function useV4MigrationPanel() {
  const ctx = useContext(V4MigrationPanelContext);
  if (!ctx)
    throw new Error(
      "useV4MigrationPanel must be used within V4MigrationPanelProvider",
    );
  return ctx;
}
