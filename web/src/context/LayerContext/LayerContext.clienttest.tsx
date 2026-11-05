import { render, screen } from "@testing-library/react";

import { Layer } from "@/src/components/design-system/Layer/Layer";
import { LayerProvider, useLayerContainer } from "./LayerContext";

function LayerContainerProbe() {
  const container = useLayerContainer("modal");
  return <span>{container?.dataset.layer ?? "missing"}</span>;
}

describe("LayerProvider", () => {
  it("resolves layer containers on the first client render", () => {
    render(
      <LayerProvider>
        <LayerContainerProbe />
      </LayerProvider>,
    );

    expect(screen.getByText("modal")).toBeInTheDocument();
    expect(screen.queryByText("missing")).toBeNull();
  });

  it("provides ordered body-level containers to portals", () => {
    render(
      <LayerProvider>
        <LayerContainerProbe />
        <Layer name="toast">
          <span>Portaled content</span>
        </Layer>
      </LayerProvider>,
    );

    expect(screen.getByText("modal")).toBeInTheDocument();
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

  it("hands portals a body-contained layer after the overlay root is gone", () => {
    const { unmount } = render(
      <LayerProvider>
        <LayerContainerProbe />
      </LayerProvider>,
    );
    unmount();
    expect(document.querySelector("[data-overlay-root]")).toBeNull();

    render(<LayerContainerProbe />);

    const layer = document.querySelector("[data-layer='modal']");
    expect(layer).not.toBeNull();
    expect(document.body.contains(layer)).toBe(true);
    expect(screen.getByText("modal")).toBeInTheDocument();
  });

  it("recreates a body-contained layer when the provider snapshot is detached", () => {
    const { rerender } = render(
      <LayerProvider>
        <LayerContainerProbe />
      </LayerProvider>,
    );
    const detached = document.querySelector("[data-overlay-root]");
    expect(detached).not.toBeNull();
    detached?.remove();

    rerender(
      <LayerProvider>
        <LayerContainerProbe />
      </LayerProvider>,
    );

    const layer = document.querySelector("[data-layer='modal']");
    expect(layer).not.toBeNull();
    expect(layer).not.toBe(detached?.querySelector("[data-layer='modal']"));
    expect(document.body.contains(layer)).toBe(true);
    expect(screen.getByText("modal")).toBeInTheDocument();
  });

  it("keeps the overlay root while another provider is mounted", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);

    const { unmount: unmountFirst } = render(
      <LayerProvider>
        <LayerContainerProbe />
      </LayerProvider>,
      { container: first },
    );
    const overlay = document.querySelector("[data-overlay-root]");
    const { unmount: unmountSecond } = render(
      <LayerProvider>
        <LayerContainerProbe />
      </LayerProvider>,
      { container: second },
    );

    unmountFirst();
    expect(document.body.contains(overlay)).toBe(true);
    expect(overlay?.querySelector("[data-layer='modal']")?.isConnected).toBe(
      true,
    );

    unmountSecond();
    expect(document.querySelector("[data-overlay-root]")).toBeNull();
  });
});
