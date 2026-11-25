import { useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { AppNavigationProvider } from "./AppNavigationProvider";
import { UserMenuItems, type UserNavigationItem } from "./UserMenuItems";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";

const meta = preview.meta({ component: UserMenuItems });

export const DialogHandoff = meta.story({
  name: "(Test) Account dialog releases navigation first",
  render: () => {
    const [navigationOpen, setNavigationOpen] = useState(true);
    const [themeSelected, setThemeSelected] = useState(false);
    const [navigationWasOpen, setNavigationWasOpen] = useState<boolean | null>(
      null,
    );
    const items: UserNavigationItem[] = [
      {
        type: "action",
        name: "Theme",
        onClick: () => setThemeSelected(true),
      },
      {
        type: "action",
        name: "Feature preview",
        handoff: "dialog",
        onClick: () =>
          setNavigationWasOpen(
            document.querySelector('[aria-label="Navigation"]') !== null,
          ),
      },
    ];
    return (
      <AppNavigationProvider
        value={{
          shell: "next",
          isSidebarExpanded: true,
          SidebarControl: null,
          openMobileNavigation: () => setNavigationOpen(true),
          closeTransientNavigation: () => setNavigationOpen(false),
        }}
      >
        {navigationOpen && (
          <section aria-label="Navigation">
            <DropdownMenu>
              <DropdownMenuTrigger>Account</DropdownMenuTrigger>
              <DropdownMenuContent>
                <UserMenuItems items={items} />
              </DropdownMenuContent>
            </DropdownMenu>
          </section>
        )}
        {themeSelected && <p>Theme selected</p>}
        {navigationWasOpen !== null && (
          <div
            role="dialog"
            aria-label="Feature preview"
            data-navigation-was-open={navigationWasOpen}
          />
        )}
      </AppNavigationProvider>
    );
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Account" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "Theme" }));
    await expect(canvas.getByText("Theme selected")).toBeVisible();
    await waitFor(() =>
      expect(canvas.getByRole("region", { name: "Navigation" })).toBeVisible(),
    );

    await userEvent.click(canvas.getByRole("button", { name: "Account" }));
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Feature preview" }),
    );
    await expect(
      canvas.getByRole("dialog", { name: "Feature preview" }),
    ).toHaveAttribute("data-navigation-was-open", "false");
  },
});
