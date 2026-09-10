import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  LAYER_ORDER,
  useLayerContainer,
  type LayerName,
} from "@/src/components/ui/layer";

const installOverlayLayers = () => {
  const overlayRoot = document.createElement("div");
  overlayRoot.setAttribute("data-overlay-root", "");
  for (const layer of LAYER_ORDER) {
    const layerNode = document.createElement("div");
    layerNode.setAttribute("data-layer", layer);
    overlayRoot.appendChild(layerNode);
  }
  document.body.appendChild(overlayRoot);
};

function FirstRenderLayerProbe({ name }: { name: LayerName }) {
  const container = useLayerContainer(name);
  const first = useRef(container);
  return (
    <div
      data-testid="layer-first-render"
      data-has-container={first.current ? "yes" : "no"}
    />
  );
}

describe("useLayerContainer", () => {
  beforeEach(() => {
    installOverlayLayers();
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it("resolves the static overlay layer on the first client render", () => {
    render(<FirstRenderLayerProbe name="modal" />);

    expect(screen.getByTestId("layer-first-render")).toHaveAttribute(
      "data-has-container",
      "yes",
    );
  });

  it("portals an open dialog into the modal layer without an aria-hidden warning", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Save view</DialogTitle>
          <DialogDescription>Name this table view.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.closest("[data-layer='modal']")).not.toBeNull();
    expect(
      consoleError.mock.calls.some((args) =>
        args.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("aria-hidden") &&
            arg.includes("not contained inside"),
        ),
      ),
    ).toBe(false);

    consoleError.mockRestore();
  });
});
