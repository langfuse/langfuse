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
  /** Section the drawer shows when it opens; a closed→open resets to intro. */
  initialMode: SupportDrawerMode;
  /** Topic preselected in the support form; a closed→open resets it. */
  initialTopic: Topic | null;
  /**
   * Bumped on closed→open transitions and on every openWithMode so the
   * drawer can remount via key and re-seed mode/topic. A redundant
   * setOpen(true) while already open does NOT bump it.
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

  const setOpen = useCallback(
    (v: boolean) => {
      // Reseed only on a closed→open transition: a redundant setOpen(true)
      // while open (support button, "Report issue") must not remount the
      // drawer and wipe an in-progress draft. openWithMode always reseeds.
      if (v && !open) {
        setInitialMode("intro");
        setInitialTopic(null);
        setOpenEpoch((e) => e + 1);
      }
      setOpenState(v);
    },
    [open],
  );

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
