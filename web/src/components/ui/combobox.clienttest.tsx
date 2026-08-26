import { fireEvent, render, screen } from "@testing-library/react";
import { Combobox } from "@/src/components/ui/combobox";
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

describe("Combobox footer", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    installOverlayLayers();
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it("renders a footer action after the category list", async () => {
    render(
      <Combobox
        options={[{ value: "internal_user" }, { value: "just_testing" }]}
        placeholder="Select category"
        footer={({ search }) => (
          <button type="button">
            {search ? `Add "${search}"` : "Add new category"}
          </button>
        )}
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));

    expect(
      await screen.findByRole("button", { name: "Add new category" }),
    ).toBeInTheDocument();
  });
});
