import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomUiRenderer } from "./CustomUiRenderer";
import type { CustomUiRenderInput, CustomUiSpec } from "./spec";

vi.mock("@sentry/nextjs", () => ({
  startSpan: (_options: unknown, callback: () => unknown) => callback(),
}));

vi.mock("@/src/utils/reportError", () => ({ reportError: vi.fn() }));

const spec: CustomUiSpec = {
  root: "root",
  elements: {
    root: {
      type: "Stack",
      props: { gap: "md" },
      children: ["summary"],
    },
    summary: {
      type: "Text",
      props: {
        content: { $state: "/data/summary" },
        variant: "body",
        maxLines: null,
      },
      children: [],
    },
  },
};

const input = (summary: string): CustomUiRenderInput => ({
  envelopeVersion: "1",
  data: { summary },
  meta: { surface: "TRACE", source: "TRACE" },
  scores: [],
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("CustomUiRenderer", () => {
  it("renders through the official runtime inside a no-capture boundary", () => {
    const view = render(
      <CustomUiRenderer spec={spec} input={input("First result")} />,
    );

    expect(screen.getByText("First result")).toBeInTheDocument();
    expect(view.container.querySelector("[data-custom-ui-root]")).toHaveClass(
      "ph-no-capture",
    );
  });

  it("recompiles and resets provider state when the selected example changes", () => {
    const view = render(
      <CustomUiRenderer spec={spec} input={input("First result")} />,
    );
    expect(screen.getByText("First result")).toBeInTheDocument();

    view.rerender(
      <CustomUiRenderer spec={spec} input={input("Second result")} />,
    );

    expect(screen.queryByText("First result")).not.toBeInTheDocument();
    expect(screen.getByText("Second result")).toBeInTheDocument();
  });

  it("falls back without exposing validation details", () => {
    render(
      <CustomUiRenderer
        spec={{ ...spec, root: "missing" }}
        input={input("sensitive trace content")}
        fallback={<p>Default trace view</p>}
      />,
    );

    expect(screen.getByText("Default trace view")).toBeInTheDocument();
    expect(
      screen.queryByText("sensitive trace content"),
    ).not.toBeInTheDocument();
  });

  it("reveals expensive detail in a later render stage", async () => {
    vi.useFakeTimers();
    const stagedSpec: CustomUiSpec = {
      root: "root",
      elements: {
        root: {
          type: "Stack",
          props: { gap: "md" },
          children: ["detail"],
        },
        detail: {
          type: "Json",
          props: {
            label: "Structured result",
            value: { $state: "/data" },
            collapsed: true,
          },
          children: [],
        },
      },
    };

    render(<CustomUiRenderer spec={stagedSpec} input={input("Later")} />);
    expect(screen.queryByText("Structured result")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show remaining sections" }),
    ).toBeInTheDocument();

    await act(() => vi.runOnlyPendingTimersAsync());
    expect(screen.getByText("Structured result")).toBeInTheDocument();
  });
});
