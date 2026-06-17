import * as React from "react";
import { createPortal } from "react-dom";

/**
 * App overlay layers — the seed of an app-wide layer system.
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
 * maps this list to the containers — and render `<Layer name="…">`.
 */
export const LAYER_ORDER = ["tooltip"] as const;
export type LayerName = (typeof LAYER_ORDER)[number];

function useLayerContainer(name: LayerName): HTMLElement | null {
  // null on the server and the first client render (SSR parity), then the
  // matching container declared in _document. It is static HTML, so it always
  // exists post-hydration — no creation, no ordering, no teardown here.
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
 * Prefer the Radix primitives' built-in `*.Portal` for Radix overlays; reach
 * for `<Layer>` when portaling bespoke, imperatively-positioned content (e.g. a
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
