import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";

export type V4MigrationTargetProject = { id: string; name: string };

type V4MigrationPanelContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Project the panel content is about; set by whichever surface opened it. */
  targetProject: V4MigrationTargetProject | null;
  openForProject: (project: V4MigrationTargetProject) => void;
};

const V4MigrationPanelContext =
  createContext<V4MigrationPanelContextType | null>(null);

export interface V4MigrationPanelProviderProps extends PropsWithChildren {
  defaultOpen?: boolean;
}

// V4MigrationPanelProvider to allow us to open the panel from anywhere in the app
export function V4MigrationPanelProvider({
  children,
  defaultOpen = false,
}: V4MigrationPanelProviderProps) {
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const [requestedOpen, setRequestedOpen] = useState(defaultOpen);
  const [targetProject, setTargetProject] =
    useState<V4MigrationTargetProject | null>(null);

  const open = v4UpgradeUiEnabled && requestedOpen;
  const setOpen = (nextOpen: boolean) => {
    setRequestedOpen(v4UpgradeUiEnabled && nextOpen);
  };
  const openForProject = (project: V4MigrationTargetProject) => {
    if (!v4UpgradeUiEnabled) return;
    setTargetProject(project);
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
