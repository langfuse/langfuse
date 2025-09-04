import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";

type SupportDrawerContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const SupportDrawerContext = createContext<SupportDrawerContextType | null>(
  null,
);

export interface SupportDrawerProviderProps extends PropsWithChildren {
  defaultOpen?: boolean;
}

// SupportDrawerProvider to allow us to open the drawer from anywhere in the app
export function SupportDrawerProvider({
  children,
  defaultOpen = false,
}: SupportDrawerProviderProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <SupportDrawerContext.Provider value={{ open, setOpen }}>
      {children}
    </SupportDrawerContext.Provider>
  );
}

export function useSupportDrawer() {
  const ctx = useContext(SupportDrawerContext);
  if (!ctx)
    throw new Error(
      "useSupportDrawer must be used within SupportDrawerProvider",
    );
  return ctx;
}
