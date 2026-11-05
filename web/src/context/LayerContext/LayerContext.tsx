/* eslint-disable @repo/component-file-structure */
import * as React from "react";

import { LAYER_ORDER, type LayerName } from "./layers";
import { PopoverLayerContext } from "./PopoverLayerProvider";

const LayerContext = React.createContext<Map<
  LayerName,
  HTMLElement | null
> | null>(null);

/** Keeps nested overlays within the accessibility subtree of their parent. */
export function LayerContainerProvider({
  name,
  container,
  children,
}: {
  name: LayerName;
  container: HTMLElement | null;
  children: React.ReactNode;
}) {
  const inheritedLayers = React.useContext(LayerContext);
  const layers = new Map(inheritedLayers);
  layers.set(name, container);
  return (
    <LayerContext.Provider value={layers}>{children}</LayerContext.Provider>
  );
}

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
      `:scope > [data-layer="${CSS.escape(name)}"]`,
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
  const [layers, setLayers] = React.useState<Map<
    LayerName,
    HTMLElement
  > | null>(() => {
    if (typeof document === "undefined") {
      return null;
    }
    return ensureLayerContainers();
  });

  // After SSR hydration the initializer does not re-run, so `layers` stays the
  // server snapshot (`null`). Adjust during render so the next pass already
  // has live nodes — an effect would be one paint too late for an open overlay.
  if (typeof document !== "undefined" && layers == null) {
    setLayers(ensureLayerContainers());
  }

  return (
    <LayerContext.Provider value={layers}>{children}</LayerContext.Provider>
  );
}

function connectedLayer(
  name: LayerName,
  layers: Map<LayerName, HTMLElement | null> | null,
): HTMLElement | null {
  const fromContext = layers?.get(name) ?? null;
  if (fromContext?.isConnected) {
    return fromContext;
  }
  if (typeof document === "undefined") {
    return null;
  }
  const created = ensureLayerContainers().get(name) ?? null;
  return created?.isConnected ? created : null;
}

/** Returns the scoped layer container used by Radix/Vaul portals. */
export function useLayerContainer(name: LayerName) {
  const layers = React.useContext(LayerContext);
  const popoverContainer = React.useContext(PopoverLayerContext);
  if (name === "popover" && popoverContainer !== undefined) {
    return popoverContainer;
  }
  return connectedLayer(name, layers);
}
