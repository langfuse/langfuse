import {
  createContext,
  useCallback,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";

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
  const [open, setOpen] = useState(defaultOpen);
  const [targetProject, setTargetProject] =
    useState<V4MigrationTargetProject | null>(null);

  const openForProject = useCallback((project: V4MigrationTargetProject) => {
    setTargetProject(project);
    setOpen(true);
  }, []);

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
