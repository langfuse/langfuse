import { render, screen } from "@testing-library/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItemWithSecondaryAction,
} from "./dropdown-menu";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";

describe("DropdownMenuItemWithSecondaryAction", () => {
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
      { wrapper: LayerProvider },
    );

    const link = screen.getByRole("link", { name: "Manage score configs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
