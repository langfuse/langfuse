import { act, render } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { ResizeContainer } from "./ResizeContainer";

describe("ResizeContainer", () => {
  let notifyResize = () => {};
  let animationFrame: FrameRequestCallback | null = null;
  let measuredWidth = 400;
  let measuredScrollHeight = 240;
  let clock = 0;
  const disconnect = vi.fn();

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    measuredWidth = 400;
    measuredScrollHeight = 240;
    clock = 0;
  });

  function renderContainer() {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      () => measuredWidth,
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      () => measuredScrollHeight,
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      animationFrame = null;
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notifyResize = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    disconnect.mockClear();
    return render(
      <ResizeContainer className="grid-host" settleMs={200}>
        {(width) => <span>{width ?? "pending"}</span>}
      </ResizeContainer>,
    );
  }

  function containerOf(view: ReturnType<typeof render>) {
    const text = view.container.querySelector("span");
    const content = text?.parentElement;
    const container = content?.parentElement;
    if (!container) throw new Error("ResizeContainer did not render");
    return container;
  }

  it("commits the first measured width", () => {
    const view = renderContainer();

    expect(view.getByText("400")).toBeInTheDocument();
    expect(containerOf(view).className).toContain("grid-host");
    expect(containerOf(view).style.overflow).toBe("");
    expect(containerOf(view).style.getPropertyValue("--lf-content-scale")).toBe(
      "",
    );
  });

  it("scales while the width changes and commits after it settles", () => {
    const view = renderContainer();

    measuredWidth = 500;
    act(() => notifyResize());
    expect(view.getByText("400")).toBeInTheDocument();

    act(() => animationFrame?.(0));
    expect(containerOf(view).style.getPropertyValue("--lf-content-scale")).toBe(
      "1.25",
    );
    expect(containerOf(view).style.overflow).toBe("hidden");
    expect(containerOf(view).style.getPropertyValue("--lf-scaled-height")).toBe(
      "300px",
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(view.getByText("500")).toBeInTheDocument();
    expect(containerOf(view).style.getPropertyValue("--lf-content-scale")).toBe(
      "",
    );
    expect(containerOf(view).style.overflow).toBe("");
  });

  it("restarts the settle timer on each width change", () => {
    const view = renderContainer();

    measuredWidth = 500;
    act(() => notifyResize());
    act(() => animationFrame?.(0));
    expect(view.getByText("400")).toBeInTheDocument();
    expect(containerOf(view).style.getPropertyValue("--lf-content-scale")).toBe(
      "1.25",
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });
    measuredWidth = 600;
    act(() => notifyResize());
    act(() => animationFrame?.(0));
    expect(view.getByText("400")).toBeInTheDocument();
    expect(containerOf(view).style.getPropertyValue("--lf-content-scale")).toBe(
      "1.5",
    );

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(view.getByText("400")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(view.getByText("600")).toBeInTheDocument();
    expect(containerOf(view).style.getPropertyValue("--lf-content-scale")).toBe(
      "",
    );
  });

  it("does not restart the settle timer when the width is unchanged", () => {
    const view = renderContainer();

    measuredWidth = 500;
    act(() => notifyResize());
    act(() => {
      clock += 150;
      vi.advanceTimersByTime(150);
    });
    act(() => notifyResize());
    act(() => {
      clock += 50;
      vi.advanceTimersByTime(50);
    });

    expect(view.getByText("500")).toBeInTheDocument();
  });

  it("keeps the committed width while every sample is a new width", () => {
    const view = renderContainer();

    for (let step = 0; step < 5; step++) {
      measuredWidth = 420 + step * 20;
      act(() => notifyResize());
      act(() => animationFrame?.(0));
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(view.getByText("400")).toBeInTheDocument();
    }
  });

  it("settles again after a gesture ends on the committed width", () => {
    const view = renderContainer();

    measuredWidth = 415;
    act(() => notifyResize());
    act(() => {
      vi.advanceTimersByTime(50);
    });
    measuredWidth = 400;
    act(() => notifyResize());
    act(() => animationFrame?.(0));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(view.getByText("400")).toBeInTheDocument();
    expect(containerOf(view).style.getPropertyValue("--lf-content-scale")).toBe(
      "",
    );

    measuredWidth = 415;
    act(() => notifyResize());
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(view.getByText("400")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(view.getByText("415")).toBeInTheDocument();
  });

  it("commits when the width flips between two values", () => {
    const view = renderContainer();

    measuredWidth = 415;
    act(() => notifyResize());
    act(() => {
      vi.advanceTimersByTime(50);
    });
    measuredWidth = 430;
    act(() => notifyResize());
    act(() => {
      vi.advanceTimersByTime(50);
    });
    measuredWidth = 415;
    act(() => notifyResize());
    act(() => animationFrame?.(0));
    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(view.getByText("400")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(view.getByText("415")).toBeInTheDocument();
  });

  it("clears a painted scale on unmount and does not commit afterwards", () => {
    const view = renderContainer();
    measuredWidth = 500;
    act(() => notifyResize());
    act(() => animationFrame?.(0));
    const container = containerOf(view);
    expect(container.style.getPropertyValue("--lf-content-scale")).toBe("1.25");

    view.unmount();
    expect(container.style.getPropertyValue("--lf-content-scale")).toBe("");
    act(() => {
      clock += 200;
      vi.advanceTimersByTime(200);
    });
    expect(container.style.getPropertyValue("--lf-content-scale")).toBe("");
  });
});
