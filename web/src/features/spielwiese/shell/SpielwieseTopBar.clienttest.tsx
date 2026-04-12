import { render, screen, within } from "@testing-library/react";
import {
  getSpielwieseDashboardVm,
  getSpielwieseShellVm,
} from "../adapters/dashboardVm";
import { SpielwieseShellProvider } from "./SpielwieseShellProvider";
import { SpielwieseTopBar } from "./SpielwieseTopBar";

function renderTopBar() {
  const shell = getSpielwieseShellVm();
  const dashboard = getSpielwieseDashboardVm();

  render(
    <SpielwieseShellProvider>
      <SpielwieseTopBar header={dashboard.header} shell={shell} />
    </SpielwieseShellProvider>,
  );
}

describe("SpielwieseTopBar", () => {
  it("uses the page-nav secondary action chrome", () => {
    renderTopBar();

    const secondaryActions = screen.getByTestId(
      "spielwiese-header-secondary-actions",
    );
    const shareButton = within(secondaryActions).getByRole("button", {
      name: "Share",
    });
    const docsLink = within(secondaryActions).getByRole("link", {
      name: "Docs",
    });
    const notificationsButton = within(secondaryActions).getByRole("button", {
      name: "Notifications",
    });
    const profileButton = within(secondaryActions).getByRole("button", {
      name: "Your profile",
    });
    const rightToggle = within(secondaryActions).getByTestId(
      "spielwiese-right-toggle",
    );

    expect(secondaryActions.className).toContain("w-fit");
    expect(secondaryActions.className).toContain("gap-2");
    expect(within(secondaryActions).queryByText("02m")).toBeNull();
    expect(shareButton.className).toContain("hidden");
    expect(shareButton.className).toContain("lg:inline-flex");
    expect(shareButton.className).toContain("h-8");
    expect(shareButton.className).toContain("rounded-[0.6rem]");
    expect(shareButton.className).toContain("border-0");
    expect(shareButton.className).toContain("bg-transparent");
    expect(shareButton.className).toContain("hover:bg-black/[0.06]");
    expect(shareButton.className).toContain("px-2.5");
    expect(docsLink.className).toContain("hidden");
    expect(docsLink.className).toContain("lg:inline-flex");
    expect(docsLink.className).toContain("h-8");
    expect(docsLink.className).toContain("rounded-[0.6rem]");
    expect(docsLink.className).toContain("border-0");
    expect(docsLink.className).toContain("bg-transparent");
    expect(docsLink.className).toContain("hover:bg-black/[0.06]");
    expect(docsLink.getAttribute("href")).toBe("https://langfuse.com/docs");
    expect(docsLink.getAttribute("target")).toBe("_blank");
    expect(notificationsButton.className).toContain("size-8");
    expect(notificationsButton.className).toContain("rounded-[0.6rem]");
    expect(notificationsButton.className).toContain("border-0");
    expect(notificationsButton.className).toContain("bg-transparent");
    expect(notificationsButton.className).toContain("hover:bg-black/[0.06]");
    expect(rightToggle.className).toContain("size-8");
    expect(rightToggle.className).toContain("p-0");
    expect(rightToggle.className).toContain("rounded-[0.6rem]");
    expect(rightToggle.className).toContain("border-0");
    expect(rightToggle.className).toContain("bg-transparent");
    expect(rightToggle.className).toContain("hover:bg-black/[0.06]");
    expect(rightToggle.textContent).toBe("");
    expect(profileButton.className).toContain("size-10");
    expect(profileButton.className).toContain("rounded-lg");
  });
});
