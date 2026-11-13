/* eslint-disable @repo/prefer-stories-over-client-tests -- One jsdom regression for the portaled token tooltip. A story play would boot a browser for a presence check this test covers directly. */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import {
  QueryInput,
  useQueryInputController,
  type QueryCompletionPlan,
} from "./QueryInput";

type Token =
  ComponentProps<typeof QueryInput> extends {
    tokens: infer Tokens;
  }
    ? Tokens extends readonly (infer Item)[]
      ? Item
      : never
    : never;

const QUERY = "alpha beta";

const tokens: Token[] = [
  {
    id: "alpha",
    from: 0,
    to: 5,
    raw: "alpha",
    kind: "filter",
    editable: true,
    error: null,
    explanation: { subject: "Alpha", predicate: "is the first filter" },
    inactiveReason: null,
  },
  {
    id: "beta",
    from: 6,
    to: 10,
    raw: "beta",
    kind: "filter",
    editable: true,
    error: null,
    explanation: { subject: "Beta", predicate: "is the second filter" },
    inactiveReason: null,
  },
];

const completions: QueryCompletionPlan = {
  options: [
    {
      id: "keep",
      label: "alpha",
      edit: { next: QUERY, caret: 1, keepOpen: false },
      onApplied: () => undefined,
    },
  ],
  autoHighlight: false,
  loading: false,
};

function rectsFor(element: HTMLElement): DOMRectList {
  if (!element.hasAttribute("data-segment-id")) {
    return { length: 0, item: () => null } as unknown as DOMRectList;
  }
  const rect = new DOMRect(8, 12, 48, 16);
  return {
    0: rect,
    length: 1,
    item: (index: number) => (index === 0 ? rect : null),
  } as unknown as DOMRectList;
}

function Editor() {
  const controller = useQueryInputController();
  const [value, setValue] = useState(QUERY);
  return (
    <QueryInput
      label="Query"
      value={value}
      diagnostics={[]}
      tokens={tokens}
      placeholder="Filter"
      controller={controller}
      completions={completions}
      onValueChange={setValue}
      onCommit={(next) => next}
      onRemoveToken={() => undefined}
      areEquivalent={(left, right) => left.trim() === right.trim()}
    />
  );
}

function placeCaret(token: HTMLElement, offset: number) {
  const text = Array.from(token.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent === "alpha",
  );
  if (text === undefined) throw new Error("Expected token text");
  const range = document.createRange();
  range.setStart(text, offset);
  range.collapse(true);
  const selection = window.getSelection();
  if (selection === null) throw new Error("Expected a selection");
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}

describe("QueryInput token tooltip", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides the tooltip while typing inside a token and shows it when another token is hovered after suggestions close", () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
      function (this: HTMLElement) {
        return rectsFor(this);
      },
    );
    render(<Editor />, { wrapper: LayerProvider });

    const input = screen.getByRole("combobox", { name: "Query" });
    const [alpha, beta] = screen.getAllByTestId("search-bar-token");
    fireEvent.focus(input);
    placeCaret(alpha!, 1);
    fireEvent.mouseOver(alpha!);
    fireEvent(
      input,
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: "x",
      }),
    );

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("search-bar-surface")).toHaveAttribute(
      "data-composer-text",
      "axlpha beta",
    );
    expect(
      screen.queryByTestId("search-bar-token-tooltip"),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    fireEvent.mouseOver(beta!);
    expect(screen.getByTestId("search-bar-token-tooltip")).toHaveTextContent(
      "Beta is the second filter",
    );
  });
});
