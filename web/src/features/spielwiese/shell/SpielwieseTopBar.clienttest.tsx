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
  expect(shareButton.getAttribute("aria-disabled")).toBe("true");
  expect(docsLink.className).toContain("hidden");
  expect(docsLink.className).toContain("lg:inline-flex");
  expect(docsLink.className).toContain("h-8");
  expect(docsLink.className).toContain("rounded-[0.6rem]");
  expect(docsLink.className).toContain("border-0");
  expect(docsLink.className).toContain("bg-transparent");
  expect(docsLink.className).toContain("hover:bg-black/[0.06]");
  expect(docsLink.getAttribute("href")).toBe("https://langfuse.com/docs");
  expect(docsLink.getAttribute("target")).toBe("_blank");
  expect(docsLink.getAttribute("aria-disabled")).toBe("true");
  expect(notificationsButton.className).toContain("size-8");
  expect(notificationsButton.className).toContain("rounded-[0.6rem]");
  expect(notificationsButton.className).toContain("border-0");
  expect(notificationsButton.className).toContain("bg-transparent");
  expect(notificationsButton.className).toContain("hover:bg-black/[0.06]");
  expect(notificationsButton.getAttribute("aria-disabled")).toBe("true");
  expect(rightToggle.className).toContain("size-8");
  expect(rightToggle.className).toContain("p-0");
  expect(rightToggle.className).toContain("rounded-[0.6rem]");
  expect(rightToggle.className).toContain("border-0");
  expect(rightToggle.className).toContain("bg-transparent");
  expect(rightToggle.className).toContain("hover:bg-black/[0.06]");
  expect(rightToggle.textContent).toBe("");
  expect(rightToggle.getAttribute("aria-disabled")).toBeNull();
  expect(profileButton.className).toContain("size-10");
  expect(profileButton.className).toContain("rounded-lg");
  expect(profileButton.getAttribute("aria-disabled")).toBe("true");
});

describe("SpielwieseTopBar canvas rail", () => {
  it("renders a left-aligned file path and a three-option canvas navigation toggle", () => {
    renderTopBar();

    const canvasRail = screen.getByTestId("spielwiese-top-bar-canvas-rail");
    const filePath = within(canvasRail).getByTestId(
      "spielwiese-top-bar-file-path",
    );
    const pathRoot = within(filePath).getByText("Files");
    const pathLeaf = within(filePath).getByText("micronutrient-tracker");
    const pathChevron = within(filePath).getByText("›");
    const toggle = within(canvasRail).getByTestId(
      "spielwiese-top-bar-mode-toggle",
    );
    const agentCompositionButton = within(toggle).getByRole("button", {
      name: "Agent Composition",
    });
    const observabilityButton = within(toggle).getByRole("button", {
      name: "Observability",
    });
    const deploymentButton = within(toggle).getByRole("button", {
      name: "Deployment",
    });

    expect(canvasRail.className).toContain("w-full");
    expect(canvasRail.className).toContain("pl-[5.125rem]");
    expect(canvasRail.className).toContain("pr-2");
    expect(filePath.className).toContain("pl-2.5");
    expect(filePath.className).toContain("pr-1");
    expect(filePath.className).not.toContain("bg-white/68");
    expect(pathRoot.className).toContain("truncate");
    expect(pathLeaf.className).toContain("truncate");
    expect(pathLeaf.className).toContain("font-medium");
    expect(pathChevron.className).toContain("text-[#9A9CA2]");
    expect(toggle.className).toContain("gap-px");
    expect(toggle.className).toContain("rounded-[8px]");
    expect(toggle.className).toContain("bg-[#F7F7F7]");
    expect(toggle.className).toContain("ring-1");
    expect(toggle.className).toContain("ring-black/5");
    expect(agentCompositionButton.getAttribute("aria-pressed")).toBe("true");
    expect(observabilityButton.getAttribute("aria-pressed")).toBe("false");
    expect(deploymentButton.getAttribute("aria-pressed")).toBe("false");
    expect(agentCompositionButton.className).toContain("h-6");
    expect(agentCompositionButton.className).toContain("min-w-24");
    expect(agentCompositionButton.className).toContain("rounded-[8px]");
    expect(agentCompositionButton.className).toContain("px-2");
    expect(agentCompositionButton.className).toContain("text-[11px]");
    expect(agentCompositionButton.className).toContain("bg-white");
    expect(agentCompositionButton.className).toContain("text-[#202427]");
    expect(deploymentButton.className).toContain("text-foreground/62");
    expect(deploymentButton.className).toContain("hover:text-foreground");
    expect(agentCompositionButton.getAttribute("aria-disabled")).toBe("true");
    expect(observabilityButton.getAttribute("aria-disabled")).toBe("true");
    expect(deploymentButton.getAttribute("aria-disabled")).toBe("true");
  });
});
