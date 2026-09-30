import {
  createContext,
  useContext,
  useState,
  useCallback,
  type PropsWithChildren,
} from "react";
import { useRouter } from "next/router";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags";

const TraceliftContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => undefined });

export function TraceliftProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const enabled = useInternalFeaturesEnabled();
  const projectId =
    typeof router.query.projectId === "string" ? router.query.projectId : null;
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const open = enabled && projectId !== null && openProjectId === projectId;

  // A preview request belongs to one project and one enabled session.
  if (openProjectId !== null && !open) {
    setOpenProjectId(null);
  }

  const setOpen = useCallback(
    (nextOpen: boolean) => setOpenProjectId(nextOpen ? projectId : null),
    [projectId],
  );

  return (
    <TraceliftContext.Provider value={{ open, setOpen }}>
      {children}
    </TraceliftContext.Provider>
  );
}

export function useTracelift() {
  return useContext(TraceliftContext);
}
