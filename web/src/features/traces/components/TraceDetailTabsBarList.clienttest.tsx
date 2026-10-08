/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Tabs } from "@/src/components/design-system/Tabs/Tabs";

import { TraceDetailTabsBarList } from "./TraceDetailTabsBarList";

// jsdom has no layout engine, so every width is 0 and the component would
// always believe the triggers fit. These two widths stand in for the layout the
// browser would compute: the space left for the triggers next to the trailing
// controls, and the width the triggers need.
let availableWidth = 1000;
let triggersWidth = 400;
const resizeCallbacks: ResizeObserverCallback[] = [];

function isAvailableElement(element: HTMLElement) {
  // The measured container is the only element the component puts directly
  // inside the tab list.
  return element.parentElement?.getAttribute("role") === "tablist";
}

function setAvailableWidth(width: number) {
  availableWidth = width;
  act(() => {
    for (const callback of resizeCallbacks) {
      callback([], {} as ResizeObserver);
    }
  });
}

function renderTabsBar() {
  return render(
    <Tabs value="preview" onValueChange={vi.fn()}>
      <TraceDetailTabsBarList
        tabs={["preview", "scores"]}
        selectedTab="preview"
        onSelect={vi.fn()}
        triggers={
          <>
            <Tabs.Trigger value="preview" label="Preview" />
            <Tabs.Trigger value="scores" label="Scores" />
          </>
        }
        trailingControls={<div>Trailing</div>}
      />
    </Tabs>,
  );
}

beforeEach(() => {
  availableWidth = 1000;
  triggersWidth = 400;
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
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get(this: HTMLElement) {
      const parent = this.parentElement;
      return parent && isAvailableElement(parent) ? triggersWidth : 0;
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
});

describe("TraceDetailTabsBarList", () => {
  it("shows the tab triggers and no dropdown while they fit", () => {
    renderTabsBar();

    expect(screen.getByRole("tab", { name: "Preview" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Scores" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Detail view/ })).toBeNull();
  });

  it("falls back to the dropdown once the triggers no longer fit", () => {
    triggersWidth = 400;
    availableWidth = 200;
    renderTabsBar();

    expect(
      screen.getByRole("button", { name: "Detail view: Preview" }),
    ).toBeTruthy();
    // The triggers have to stay mounted behind the dropdown, otherwise their
    // natural width is no longer measurable and the bar can never tell that
    // there is room for them again.
    expect(screen.getByRole("tab", { name: "Preview" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Scores" })).toBeTruthy();
  });

  it("restores the tab triggers when space becomes available again", () => {
    triggersWidth = 400;
    availableWidth = 200;
    renderTabsBar();

    expect(
      screen.getByRole("button", { name: "Detail view: Preview" }),
    ).toBeTruthy();

    setAvailableWidth(800);

    expect(screen.queryByRole("button", { name: /Detail view/ })).toBeNull();
    expect(screen.getByRole("tab", { name: "Preview" })).toBeTruthy();
  });

  it("keeps the triggers when they fit the available width exactly", () => {
    triggersWidth = 400;
    availableWidth = 400;
    renderTabsBar();

    expect(screen.queryByRole("button", { name: /Detail view/ })).toBeNull();
  });
});
