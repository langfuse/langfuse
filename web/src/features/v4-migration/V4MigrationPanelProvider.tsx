import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";

type V4MigrationPanelContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
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
  return (
    <V4MigrationPanelContext.Provider value={{ open, setOpen }}>
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
