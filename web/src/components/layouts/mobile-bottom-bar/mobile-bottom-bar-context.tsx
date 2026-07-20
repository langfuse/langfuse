import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * Mobile bottom-bar seam — the app-shell-level home for per-page controls on
 * mobile (below the `md` breakpoint), mirroring the header controls slot
 * ({@link ../page-header-controls-slot}).
 *
 * The shell {@link MobileBottomBar} renders two slot targets and exposes them
 * through this context. A page portals its own controls/actions into the bar
 * from anywhere in its subtree via {@link MobileBottomBarPortal} — the state
 * stays wherever it already lives (e.g. a table owns its filter handlers); only
 * the rendered DOM moves into the shell bar. Two regions:
 *
 * - `"bar"`   — the always-visible collapsed pill. Use for 1-3 compact,
 *   icon-first quick actions (the most important per-page affordances).
 * - `"sheet"` — the expanded bottom sheet body. Use for the fuller,
 *   labelled control set (filters, time range, refresh, page actions).
 *
 * The provider also owns the low-frequency expanded (open) state so the bar's
 * expand handle and the sheet stay in sync and a page could open it
 * programmatically later.
 */
type MobileBottomBarRegion = "bar" | "sheet";

type MobileBottomBarContextValue = {
  barSlot: HTMLDivElement | null;
  setBarSlot: (node: HTMLDivElement | null) => void;
  sheetSlot: HTMLDivElement | null;
  setSheetSlot: (node: HTMLDivElement | null) => void;
  expanded: boolean;
  setExpanded: (open: boolean) => void;
};

const MobileBottomBarContext =
  createContext<MobileBottomBarContextValue | null>(null);

export function MobileBottomBarProvider({
  children,
  defaultExpanded = false,
}: {
  children: ReactNode;
  /** Initial expanded state. Defaults to collapsed; stories pass `true`. */
  defaultExpanded?: boolean;
}) {
  const [barSlot, setBarSlot] = useState<HTMLDivElement | null>(null);
  const [sheetSlot, setSheetSlot] = useState<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const value = useMemo(
    () => ({
      barSlot,
      setBarSlot,
      sheetSlot,
      setSheetSlot,
      expanded,
      setExpanded,
    }),
    [barSlot, sheetSlot, expanded],
  );
  return (
    <MobileBottomBarContext.Provider value={value}>
      {children}
    </MobileBottomBarContext.Provider>
  );
}

export function useMobileBottomBar() {
  return useContext(MobileBottomBarContext);
}

/**
 * Rendered by {@link MobileBottomBar} for each region. Uses `display: contents`
 * so the empty target adds no layout box; portaled children become direct
 * children (flex items) of the surrounding cluster.
 */
export function MobileBottomBarSlotTarget({
  region,
}: {
  region: MobileBottomBarRegion;
}) {
  const ctx = useContext(MobileBottomBarContext);
  if (!ctx) return null;
  const setSlot = region === "bar" ? ctx.setBarSlot : ctx.setSheetSlot;
  return <div className="contents" ref={setSlot} />;
}

/**
 * Portals its children into the mobile bottom bar. Renders nothing when there
 * is no target yet — e.g. outside {@link MobileBottomBarProvider}, or, for the
 * `"sheet"` region, while the sheet is collapsed (its target only exists in the
 * DOM once the sheet is open).
 */
export function MobileBottomBarPortal({
  region = "sheet",
  children,
}: {
  region?: MobileBottomBarRegion;
  children: ReactNode;
}) {
  const ctx = useContext(MobileBottomBarContext);
  const slot = region === "bar" ? ctx?.barSlot : ctx?.sheetSlot;
  if (!slot) return null;
  return createPortal(children, slot);
}
