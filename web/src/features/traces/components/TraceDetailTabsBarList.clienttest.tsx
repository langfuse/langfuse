/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";

import { TraceDetailTabsBarList } from "./TraceDetailTabsBarList";
import type { DetailTab } from "../contexts/SelectionContext";

// jsdom has no layout engine, so every width is 0 and every tab would always
// fit. These widths stand in for the layout the browser would compute: the
// space left for the tabs next to the trailing controls, each tab's replica in
// the measuring row, and the overflow trigger.
let availableWidth = 1000;
const tabWidths: Record<string, number> = {
  Preview: 100,
  MessagesInternal: 160,
  Scores: 100,
};
const overflowWidth = 32;
const resizeCallbacks: ResizeObserverCallback[] = [];

function isAvailableElement(element: Element | null) {
  // The measured container is the only element the bar puts directly inside
  // the tab list.
  return element?.parentElement?.getAttribute("role") === "tablist";
}

function isReplica(element: Element) {
  const row = element.parentElement;
  return (
    row?.getAttribute("aria-hidden") === "true" &&
    isAvailableElement(row.parentElement)
  );
}

function setAvailableWidth(width: number) {
  availableWidth = width;
  act(() => {
    for (const callback of resizeCallbacks) {
      callback([], {} as ResizeObserver);
    }
  });
}

function renderTabsBar({
  tabs = ["preview", "scores"],
  value = "preview",
  onValueChange = vi.fn(),
}: {
  tabs?: DetailTab[];
  value?: DetailTab;
  onValueChange?: (value: string) => void;
} = {}) {
  return render(
    <Tabs value={value} onValueChange={onValueChange}>
      <TraceDetailTabsBarList
        tabs={tabs}
        logViewDescription="Shows all observations."
        trailingControls={<div>Trailing</div>}
      />
    </Tabs>,
    { wrapper: LayerProvider },
  );
}

beforeEach(() => {
  availableWidth = 1000;
  resizeCallbacks.length = 0;

  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return isAvailableElement(this) ? availableWidth : 0;
    },
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (!isReplica(this)) return { width: 0 } as DOMRect;
      if (this.getAttribute("aria-label")) {
        return { width: overflowWidth } as DOMRect;
      }
      return { width: tabWidths[this.textContent ?? ""] ?? 0 } as DOMRect;
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

describe("TraceDetailTabsBarList", () => {
  it("shows every tab and no overflow trigger while they fit", () => {
    renderTabsBar();

    expect(screen.getByRole("tab", { name: "Preview" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Scores" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More tabs" })).toBeNull();
  });

  it("keeps the active tab and moves the rest behind the overflow trigger", () => {
    availableWidth = 150;
    renderTabsBar({ value: "scores" });

    expect(screen.getByRole("tab", { name: "Scores" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Preview" })).toBeNull();
    expect(screen.getByRole("button", { name: "More tabs" })).toBeTruthy();
  });

  it("brings the tabs back when space becomes available again", () => {
    availableWidth = 150;
    renderTabsBar();

    expect(screen.queryByRole("tab", { name: "Scores" })).toBeNull();

    setAvailableWidth(800);

    expect(screen.getByRole("tab", { name: "Scores" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "More tabs" })).toBeNull();
  });

  it("selects a hidden tab from the overflow menu", async () => {
    const onValueChange = vi.fn();
    availableWidth = 150;
    renderTabsBar({ onValueChange });

    fireEvent.click(screen.getByRole("button", { name: "More tabs" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Scores" }));

    expect(onValueChange).toHaveBeenCalledWith("scores");
  });

  it("carries the tab badge into the overflow menu row", async () => {
    availableWidth = 150;
    renderTabsBar({ tabs: ["preview", "messages"] });

    fireEvent.click(screen.getByRole("button", { name: "More tabs" }));

    expect(
      (await screen.findByRole("menuitem", { name: /Messages/ })).textContent,
    ).toContain("Internal");
  });
});
