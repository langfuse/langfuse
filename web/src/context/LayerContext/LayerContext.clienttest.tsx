import { render, screen, waitFor } from "@testing-library/react";

import { Layer } from "@/src/components/design-system/Layer/Layer";
import { LayerProvider, useLayerContainer } from "./LayerContext";

function LayerContainerProbe() {
  const container = useLayerContainer("modal");
  return <span>{container?.dataset.layer ?? "missing"}</span>;
}

describe("LayerProvider", () => {
  it("provides ordered body-level containers to portals", async () => {
    render(
      <LayerProvider>
        <LayerContainerProbe />
        <Layer name="toast">
          <span>Portaled content</span>
        </Layer>
      </LayerProvider>,
    );

    await waitFor(() => expect(screen.getByText("modal")).toBeInTheDocument());
    expect(screen.getByText("Portaled content").parentElement).toHaveAttribute(
      "data-layer",
      "toast",
    );

    const layers = document.querySelectorAll(
      "body > [data-overlay-root] > [data-layer]",
    );
    expect(
      [...layers].map((layer) => layer.getAttribute("data-layer")),
    ).toEqual(["panel", "agent", "modal", "popover", "tooltip", "toast"]);
  });
});
