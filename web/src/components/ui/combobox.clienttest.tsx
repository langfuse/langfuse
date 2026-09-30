import { fireEvent, render, screen } from "@testing-library/react";
import { Combobox } from "@/src/components/ui/combobox";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";

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
      { wrapper: LayerProvider },
    );

    fireEvent.click(screen.getByRole("combobox"));

    expect(
      await screen.findByRole("button", { name: "Add new category" }),
    ).toBeInTheDocument();
  });
});
