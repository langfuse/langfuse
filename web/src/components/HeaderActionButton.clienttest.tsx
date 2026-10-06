import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { HeaderActionButton } from "./HeaderActionButton";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("tooltip delays", () => {
  it.each([
    { delay: undefined, expectedDelay: 300 },
    { delay: 700, expectedDelay: 700 },
  ])(
    "opens after $expectedDelay milliseconds",
    async ({ delay, expectedDelay }) => {
      vi.useFakeTimers();
      render(
        <CustomTooltip content={<span>Tooltip content</span>} delay={delay}>
          {({ getTriggerProps }) => (
            <button {...getTriggerProps()}>Trigger</button>
          )}
        </CustomTooltip>,
        { wrapper: LayerProvider },
      );

      fireEvent.mouseEnter(screen.getByRole("button", { name: "Trigger" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(expectedDelay - 1);
      });
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByRole("tooltip")).toHaveTextContent("Tooltip content");
    },
  );
});

describe("HeaderActionButton refs", () => {
  it("forwards object refs while retaining the tooltip reference", async () => {
    vi.useFakeTimers();
    const ref = createRef<HTMLButtonElement>();
    const { unmount } = render(
      <HeaderActionButton ref={ref} label="Action" icon={<span />} />,
      { wrapper: LayerProvider },
    );
    const button = screen.getByRole("button", { name: "Action" });
    expect(ref.current).toBe(button);

    fireEvent.mouseEnter(button);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Action");

    unmount();
    expect(ref.current).toBeNull();
  });

  it("preserves callback ref cleanup", () => {
    const cleanupRef = vi.fn();
    const ref = vi.fn((node: HTMLButtonElement | null) => {
      if (node) return cleanupRef;
    });
    const { unmount } = render(
      <HeaderActionButton ref={ref} label="Action" icon={<span />} />,
      { wrapper: LayerProvider },
    );
    expect(ref).toHaveBeenCalledWith(
      screen.getByRole("button", { name: "Action" }),
    );

    unmount();
    expect(cleanupRef).toHaveBeenCalledOnce();
  });
});
