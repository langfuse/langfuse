import * as React from "react";

import { LAYER_ORDER, type LayerName } from "./layers";

const LayerContext = React.createContext<Map<LayerName, HTMLElement> | null>(
  null,
);

export function LayerProvider({ children }: { children: React.ReactNode }) {
  const [layers, setLayers] = React.useState<Map<
    LayerName,
    HTMLElement
  > | null>(null);

  React.useEffect(() => {
    const root = document.createElement("div");
    root.setAttribute("data-overlay-root", "");

    const layerContainers = new Map<LayerName, HTMLElement>();
    for (const name of LAYER_ORDER) {
      const layer = document.createElement("div");
      layer.setAttribute("data-layer", name);
      root.appendChild(layer);
      layerContainers.set(name, layer);
    }

    document.body.appendChild(root);
    setLayers(layerContainers);

    return () => root.remove();
  }, []);

  return (
    <LayerContext.Provider value={layers}>{children}</LayerContext.Provider>
  );
}

/** Returns the body-level container used by Radix/Vaul portals. */
export function useLayerContainer(name: LayerName) {
  return React.useContext(LayerContext)?.get(name) ?? null;
}
