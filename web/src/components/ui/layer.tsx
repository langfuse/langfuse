import * as React from "react";
import { createPortal } from "react-dom";

/**
 * App overlay layers — the app-wide layer system for ALL overlays.
 *
 * The whole app renders inside `#__next`, isolated into its own stacking
 * context (`isolation: isolate`, in globals.css). That caps every z-index in
 * the app, so nothing inside can escape it. The overlay layer containers are
 * declared once in `_document.tsx` as `<body>` siblings AFTER `#__next`, so
 * they paint on top purely by DOM order — no z-index anywhere in this system.
 *
 * Layers stack by ORDER, not z-index: the containers are rendered in this order
 * (later = on top) and each is its own isolated stacking context. z-index stays
 * a LOCAL tool for ordering content WITHIN one layer (or within the app), never
 * a global escalation. To add a layer, append its name here — `_document.tsx`
 * maps this list to the containers — and render `<Layer name="…">` (for bespoke
 * content) or route a Radix/Vaul portal into it via {@link useLayerContainer}
 * (for primitives).
 *
 * THE RULE (enforce, don't regress): every overlay portals ONLY through a
 * layer `container`; never re-introduce a high/arbitrary z-index (`z-50`,
 * `z-[9999]`, …) on an overlay wrapper to "escape" to the top, and never let a
 * Radix/Vaul `*.Portal` fall back to `<body>`. Ordering is the layer's job. The
 * `@repo/no-overlay-zindex` lint rule guards the z-index half of this.
 *
 * The bands, low → high:
 * - `panel`   — docked/side surfaces like Sheet, Drawer, and the table peek.
 *   Above `#__next`, below the in-app assistant and true blocking modals.
 * - `agent`   — the in-app assistant window: a persistent, draggable/resizable
 *   panel that floats above page content and app panels but BELOW every true
 *   modal/transient overlay, so dialogs, dropdowns, popovers, tooltips and
 *   toasts (incl. ones opened from inside the window itself, e.g. its
 *   conversation-history menu) all paint above it.
 * - `modal`   — true blocking Dialog and AlertDialog surfaces.
 * - `popover` — Popover, DropdownMenu, Select, HoverCard. ABOVE `modal` so a
 *   Select/Popover/Dropdown opened *inside* a Dialog renders above it (matches
 *   the old "newest-opened wins" z-50 behaviour; the common in-form case).
 * - `tooltip` — Tooltip and bespoke anchored tooltips (search bar).
 * - `toast`   — Sonner toasts. Last, so they always sit above every overlay
 *   (incl. a non-modal peek) by DOM order alone — no z-index needed.
 */
export const LAYER_ORDER = [
  "panel",
  "agent",
  "modal",
  "popover",
  "tooltip",
  "toast",
] as const;
export type LayerName = (typeof LAYER_ORDER)[number];

/**
 * The DOM element of the named overlay layer, for handing to a Radix/Vaul
 * `*.Portal`'s `container` prop so the portal re-parents into that layer
 * instead of `<body>`. This only moves where the DOM is appended — it does NOT
 * touch a11y: focus trap, Escape, aria wiring and `data-state` animations all
 * live on the Radix Root/Content, not the portal parent.
 *
 * Returns `null` on the server and the first client render (SSR parity), then
 * the matching container declared in `_document`. When `null`, callers pass it
 * straight through to the portal's `container`, which falls back to
 * `document.body` — identical to pre-migration behaviour on first paint. The
 * container is static HTML, so it always exists post-hydration: no creation, no
 * ordering, no teardown here.
 */
export function useLayerContainer(name: LayerName): HTMLElement | null {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setContainer(
      document.querySelector<HTMLElement>(
        `[data-overlay-root] > [data-layer="${CSS.escape(name)}"]`,
      ),
    );
  }, [name]);
  return container;
}

/**
 * Renders its children into the named overlay layer (see {@link LAYER_ORDER}),
 * escaping ancestor `overflow` clipping and stacking contexts. Renders nothing
 * until mounted, so it is SSR-safe. Children position themselves (`fixed` /
 * `absolute`) and opt back into pointer events as needed.
 *
 * Prefer the Radix primitives' built-in `*.Portal` (with
 * {@link useLayerContainer} for the `container`) for Radix overlays; reach for
 * `<Layer>` when portaling bespoke, imperatively-positioned content (e.g. a
 * contenteditable's anchored tooltip) that isn't a Radix component.
 */
export function Layer({
  name,
  children,
}: {
  name: LayerName;
  children: React.ReactNode;
}) {
  const container = useLayerContainer(name);
  return container ? createPortal(children, container) : null;
}
