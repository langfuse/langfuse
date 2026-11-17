import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppNavigationProvider } from "./AppNavigationProvider";
import { UserMenuItems, type UserNavigationItem } from "./UserMenuItems";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";

it("keeps ordinary account actions in navigation and closes it before opening a dialog", () => {
  function AccountNavigation() {
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
        onClick: () => {
          setNavigationWasOpen(
            document.querySelector('[aria-label="Navigation"]') !== null,
          );
        },
      },
    ];
    return (
      <AppNavigationProvider
        value={{
          shell: "next",
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
  }

  render(<AccountNavigation />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Account" }), {
    key: "Enter",
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "Theme" }));
  expect(screen.getByText("Theme selected")).toBeVisible();
  expect(screen.getByRole("region", { name: "Navigation" })).toBeVisible();

  fireEvent.keyDown(screen.getByRole("button", { name: "Account" }), {
    key: "Enter",
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "Feature preview" }));
  expect(
    screen.getByRole("dialog", { name: "Feature preview" }),
  ).toHaveAttribute("data-navigation-was-open", "false");
});
