import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuController,
  DropdownMenuItem,
  DropdownMenuItemWithSecondaryAction,
} from "@/src/components/ui/dropdown-menu";
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

describe("DropdownMenuController", () => {
  it("suspends an open menu while its owner is inactive without restoring focus", async () => {
    const menu = (isActive: boolean) => (
      <DropdownMenuController
        align="start"
        isActive={isActive}
        renderMenu={() => <DropdownMenuItem>Clear value</DropdownMenuItem>}
      >
        {({ Trigger }) => <Trigger>Actions</Trigger>}
      </DropdownMenuController>
    );
    const { rerender } = render(menu(true), { wrapper: LayerProvider });
    const trigger = screen.getByRole("button", { name: "Actions" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(await screen.findByRole("menuitem")).toHaveTextContent(
      "Clear value",
    );

    rerender(menu(false));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(trigger).not.toHaveFocus();

    rerender(menu(true));
    expect(await screen.findByRole("menuitem")).toHaveTextContent(
      "Clear value",
    );
  });
});
