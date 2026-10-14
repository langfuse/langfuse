import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * Header "controls slot" — lets a deeply nested component (typically a list
 * table) render controls such as the time-range picker and auto-refresh button
 * next to the page title, mirroring the Home dashboard layout.
 *
 * The shared {@link Page} component renders a {@link PageHeaderControlsSlotTarget}
 * inside the header's left cluster and exposes it through context. Descendants
 * portal into it via {@link PageHeaderControlsPortal}. State stays wherever it
 * already lives (e.g. the table owns the refresh handlers) — only the rendered
 * DOM moves into the header.
 */
const PageHeaderControlsSlotContext = createContext<{
  slot: HTMLDivElement | null;
  setSlot: (node: HTMLDivElement | null) => void;
} | null>(null);

export function PageHeaderControlsSlotProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const value = useMemo(() => ({ slot, setSlot }), [slot]);
  return (
    <PageHeaderControlsSlotContext.Provider value={value}>
      {children}
    </PageHeaderControlsSlotContext.Provider>
  );
}

/**
 * Rendered by {@link Page} into the header's left cluster. Uses `display:
 * contents` so the empty target adds no layout box; portaled children become
 * direct flex items of the surrounding cluster.
 */
export function PageHeaderControlsSlotTarget() {
  const ctx = useContext(PageHeaderControlsSlotContext);
  if (!ctx) return null;
  return <div className="contents" ref={ctx.setSlot} />;
}

/**
 * Portals its children into the page header's controls slot. Renders nothing
 * when there is no slot (e.g. the component is used outside of {@link Page},
 * such as embedded in a tab or dialog).
 */
export function PageHeaderControlsPortal({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = useContext(PageHeaderControlsSlotContext);
  if (!ctx?.slot) return null;
  return createPortal(children, ctx.slot);
}
