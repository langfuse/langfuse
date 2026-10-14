import * as React from "react";

import { LAYER_ORDER, type LayerName } from "./layers";

const LayerContext = React.createContext<Map<LayerName, HTMLElement> | null>(
  null,
);

function ensureLayerContainers(): Map<LayerName, HTMLElement> {
  let root = document.querySelector<HTMLElement>("[data-overlay-root]");
  if (!root) {
    root = document.createElement("div");
    root.setAttribute("data-overlay-root", "");
    document.body.appendChild(root);
  }

  const layerContainers = new Map<LayerName, HTMLElement>();
  for (const name of LAYER_ORDER) {
    let layer = root.querySelector<HTMLElement>(
      `[data-layer="${CSS.escape(name)}"]`,
    );
    if (!layer) {
      layer = document.createElement("div");
      layer.setAttribute("data-layer", name);
      root.appendChild(layer);
    }
    layerContainers.set(name, layer);
  }
  return layerContainers;
}

export function LayerProvider({ children }: { children: React.ReactNode }) {
  // Resolve on the first client render. Creating the nodes in an effect leaves
  // `useLayerContainer` as null for one paint, so Radix/Vaul portals hop
  // through `document.body` and `hideOthers` logs `aria-hidden … not contained
  // inside body`.
  const [layers] = React.useState<Map<LayerName, HTMLElement> | null>(() => {
    if (typeof document === "undefined") {
      return null;
    }
    return ensureLayerContainers();
  });

  React.useEffect(() => {
    const root = document.querySelector("[data-overlay-root]");
    return () => root?.remove();
  }, []);

  return (
    <LayerContext.Provider value={layers}>{children}</LayerContext.Provider>
  );
}

/** Returns the body-level container used by Radix/Vaul portals. */
export function useLayerContainer(name: LayerName) {
  return React.useContext(LayerContext)?.get(name) ?? null;
}
