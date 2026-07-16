import {
  createContext,
  useCallback,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";
import { type Topic } from "@/src/features/support-chat/formConstants";

export type SupportDrawerMode = "intro" | "form";

type SupportDrawerContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Section the drawer shows when it opens; setOpen(true) resets to intro. */
  initialMode: SupportDrawerMode;
  /** Topic preselected in the support form; setOpen(true) resets it. */
  initialTopic: Topic | null;
  /**
   * Bumped on every open (setOpen(true) or openWithMode) so the drawer can
   * remount via key and re-seed mode/topic even when it is already open.
   */
  openEpoch: number;
  openWithMode: (mode: SupportDrawerMode, options?: { topic?: Topic }) => void;
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
  const [open, setOpenState] = useState(defaultOpen);
  const [initialMode, setInitialMode] = useState<SupportDrawerMode>("intro");
  const [initialTopic, setInitialTopic] = useState<Topic | null>(null);
  const [openEpoch, setOpenEpoch] = useState(0);

  const setOpen = useCallback((v: boolean) => {
    if (v) {
      setInitialMode("intro");
      setInitialTopic(null);
      setOpenEpoch((e) => e + 1);
    }
    setOpenState(v);
  }, []);

  const openWithMode = useCallback(
    (mode: SupportDrawerMode, options?: { topic?: Topic }) => {
      setInitialMode(mode);
      setInitialTopic(options?.topic ?? null);
      setOpenEpoch((e) => e + 1);
      setOpenState(true);
    },
    [],
  );

  return (
    <SupportDrawerContext.Provider
      value={{
        open,
        setOpen,
        initialMode,
        initialTopic,
        openEpoch,
        openWithMode,
      }}
    >
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
