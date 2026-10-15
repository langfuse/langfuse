import * as React from "react";

import { LayerContext } from "./LayerContext";

type ModalLayerProviderProps = { children: React.ReactNode };

/** Keeps a modal's floating controls inside its focus and accessibility boundary. */
export function ModalLayerProvider({ children }: ModalLayerProviderProps) {
  const parentLayers = React.useContext(LayerContext);
  const [popover, setPopover] = React.useState<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = React.useState<HTMLDivElement | null>(null);
  const layers = new Map(parentLayers);
  if (popover) layers.set("popover", popover);
  if (tooltip) layers.set("tooltip", tooltip);

  return (
    <LayerContext.Provider value={layers}>
      <div className="relative isolate flex min-h-0 flex-1 flex-col">
        {children}
      </div>
      <div data-overlay-root="">
        <div ref={setPopover} data-layer="popover" />
        <div ref={setTooltip} data-layer="tooltip" />
      </div>
    </LayerContext.Provider>
  );
}
