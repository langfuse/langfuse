import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { LifeBuoy } from "@langfuse/icons";
import { SidebarNavItem } from "./SidebarNavItem";

it("does not reveal a stale rail preview after leaving an expanded row", async () => {
  vi.useFakeTimers();
  try {
    const item = (isCollapsed: boolean) => (
      <SidebarNavItem.Button
        isCollapsed={isCollapsed}
        leading={<LifeBuoy size="base" />}
        label="Support"
      />
    );
    const { rerender } = render(item(false));
    const trigger = screen.getByRole("button", { name: "Support" });

    fireEvent.mouseEnter(trigger);
    await act(async () => vi.runOnlyPendingTimersAsync());
    fireEvent.mouseLeave(trigger, { relatedTarget: document.body });
    fireEvent.mouseMove(document.body);
    await act(async () => vi.runOnlyPendingTimersAsync());

    rerender(item(true));
    await act(async () => vi.runOnlyPendingTimersAsync());

    expect(
      screen.queryByRole("tooltip", { hidden: true }),
    ).not.toBeInTheDocument();
  } finally {
    cleanup();
    vi.useRealTimers();
  }
});
