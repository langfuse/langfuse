import { render, screen } from "@testing-library/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItemWithSecondaryAction,
} from "@/src/components/ui/dropdown-menu";
import { LAYER_ORDER } from "@/src/components/ui/layer";

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

describe("DropdownMenuItemWithSecondaryAction", () => {
  beforeEach(() => {
    installOverlayLayers();
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it("opens href items in a new tab when target is _blank", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <DropdownMenuItemWithSecondaryAction
            title="Manage score configs"
            href="/project/demo/settings/scores"
            target="_blank"
          />
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const link = screen.getByRole("link", { name: "Manage score configs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
