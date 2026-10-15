import { useContext, useState, type ReactNode } from "react";
import { LayerContext } from "./LayerContext";

/** Keeps popovers within a modal's focus and accessibility boundary. */
export function ModalPopoverLayer({ children }: { children: ReactNode }) {
  const parentLayers = useContext(LayerContext);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const layers = new Map(parentLayers);
  if (container) layers.set("popover", container);

  return (
    <LayerContext.Provider value={layers}>
      {children}
      <div data-overlay-root="">
        <div ref={setContainer} data-layer="popover" />
      </div>
    </LayerContext.Provider>
  );
}
