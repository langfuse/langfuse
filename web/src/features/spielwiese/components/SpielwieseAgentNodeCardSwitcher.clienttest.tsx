import { fireEvent, render, screen, within } from "@testing-library/react";
import { SpielwieseAgentNodeCardSwitcher } from "./SpielwieseAgentNodeCardSwitcher";

function renderCardSwitcher() {
  return render(
    <SpielwieseAgentNodeCardSwitcher
      activeView="primary"
      areNavButtonsVisible
      nodeId="vision-agent"
      primaryCard={<div data-testid="spielwiese-agent-node-card">Primary</div>}
      secondaryCard={
        <div data-testid="spielwiese-agent-node-secondary-card">Secondary</div>
      }
      onShowPrimary={() => undefined}
      onShowSecondary={() => undefined}
    />,
  );
}

function expectPortalTooltipHidden(testId: string) {
  expect(screen.queryByTestId(testId)).toBeNull();
}

function expectMountedPortalTooltip({
  switcher,
  testId,
  text,
}: {
  switcher: HTMLElement;
  testId: string;
  text: string;
}) {
  const mountedTooltip = screen.getByTestId(testId);

  expect(within(switcher).queryByTestId(testId)).toBeNull();
  expect(mountedTooltip.getAttribute("role")).toBe("tooltip");
  expect(mountedTooltip.textContent).toBe(text);
  expect(mountedTooltip.className).toContain("fixed");
  expect(mountedTooltip.className).toContain("z-[160]");
  expect(mountedTooltip.className).toContain("bg-[rgba(255,255,255,0.98)]");
  expect(mountedTooltip.className).toContain("backdrop-blur-sm");
  expect(mountedTooltip.className).toContain(
    "shadow-[0_10px_22px_rgba(15,23,42,0.08),0_2px_8px_rgba(15,23,42,0.04)]",
  );
}

describe("SpielwieseAgentNodeCardSwitcher tooltips", () => {
  it("renders version tooltips in a body portal for the previous and new version controls", () => {
    const { container } = renderCardSwitcher();

    const switcher = container.firstElementChild as HTMLElement;
    const addButton = within(switcher).getByRole("button", {
      name: "Add a new card after vision-agent",
    });
    const addButtonTrigger = within(switcher).getByTestId(
      "spielwiese-agent-node-card-add-button-trigger",
    );
    const previousButton = within(switcher).getByRole("button", {
      name: "Show previous card for vision-agent",
    });
    const previousButtonTrigger = within(switcher).getByTestId(
      "spielwiese-agent-node-card-back-button-trigger",
    );

    expect(addButton.getAttribute("disabled")).toBeNull();
    expect(previousButton.getAttribute("disabled")).toBe("");

    expectPortalTooltipHidden("spielwiese-agent-node-card-add-button-tooltip");

    fireEvent.mouseEnter(addButtonTrigger);

    expectMountedPortalTooltip({
      switcher,
      testId: "spielwiese-agent-node-card-add-button-tooltip",
      text: "New version",
    });

    fireEvent.mouseLeave(addButtonTrigger);

    expectPortalTooltipHidden("spielwiese-agent-node-card-add-button-tooltip");

    fireEvent.mouseEnter(previousButtonTrigger);

    expectMountedPortalTooltip({
      switcher,
      testId: "spielwiese-agent-node-card-back-button-tooltip",
      text: "Prev version",
    });

    fireEvent.mouseLeave(previousButtonTrigger);

    expectPortalTooltipHidden("spielwiese-agent-node-card-back-button-tooltip");
  });
});
