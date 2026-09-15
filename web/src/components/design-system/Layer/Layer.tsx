import { createPortal } from "react-dom";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { type LayerName } from "@/src/context/LayerContext/layers";

/** Portals bespoke overlay content into the requested app layer. */
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
