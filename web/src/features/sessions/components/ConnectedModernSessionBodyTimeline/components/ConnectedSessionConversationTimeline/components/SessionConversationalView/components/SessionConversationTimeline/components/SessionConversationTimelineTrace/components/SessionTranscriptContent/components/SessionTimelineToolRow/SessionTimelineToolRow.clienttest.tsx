import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionTimelineToolRow } from "./SessionTimelineToolRow";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SessionTimelineToolRow pretty-printing", () => {
  it("defaults input and output to pretty and switches their formats independently", () => {
    const value = '{"items":[1,2],"message":"hello"}';
    const { container } = render(
      <SessionTimelineToolRow
        name="tool"
        input={value}
        output={value}
        isExpanded
        onExpandedChange={vi.fn()}
      />,
    );
    const inputTabs = within(
      screen.getByRole("tablist", { name: "Tool input format" }),
    );
    const outputTabs = within(
      screen.getByRole("tablist", { name: "Tool output format" }),
    );
    const original = outputTabs.getByRole("tab", { name: "Original" });
    const pretty = outputTabs.getByRole("tab", { name: "Pretty" });
    expect(original).toHaveAttribute("aria-selected", "false");
    expect(pretty).toHaveAttribute("aria-selected", "true");
    const previews = container.querySelectorAll("pre");
    expect(inputTabs.getByRole("tab", { name: "Pretty" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      Array.from(previews[0].children, (line) => line.textContent).join("\n"),
    ).toBe(JSON.stringify(JSON.parse(value), null, 2));
    expect(
      Array.from(previews[1].children, (line) => line.textContent).join("\n"),
    ).toBe(JSON.stringify(JSON.parse(value), null, 2));
    fireEvent.mouseDown(original, { button: 0, ctrlKey: false });
    expect(original).toHaveAttribute("aria-selected", "true");
    expect(previews[1].textContent).toBe(value);
    expect(inputTabs.getByRole("tab", { name: "Pretty" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.mouseDown(pretty, { button: 0, ctrlKey: false });
    expect(pretty).toHaveAttribute("aria-selected", "true");
    expect(
      Array.from(previews[1].children, (line) => line.textContent).join("\n"),
    ).toBe(JSON.stringify(JSON.parse(value), null, 2));
    fireEvent.mouseDown(inputTabs.getByRole("tab", { name: "Original" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(previews[0].textContent).toBe(value);
    expect(pretty).toHaveAttribute("aria-selected", "true");
  });

  it.each(["not JSON", '{"broken":', "console.log('hello')"])(
    "does not offer pretty-printing for %s",
    (output) => {
      render(
        <SessionTimelineToolRow
          name="tool"
          input={null}
          output={output}
          isExpanded
          onExpandedChange={vi.fn()}
        />,
      );
      expect(
        screen.queryByRole("tablist", { name: "Tool output format" }),
      ).not.toBeInTheDocument();
    },
  );
});
