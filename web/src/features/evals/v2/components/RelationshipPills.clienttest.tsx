import { act, render, screen, within } from "@testing-library/react";

import { RelationshipPills } from "./RelationshipPills";

describe("RelationshipPills", () => {
  let availableWidth = 400;
  let resize: (() => void) | undefined;
  const originalClientWidth = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetWidth",
  );

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return this.hasAttribute("data-relationship-pills-visible")
          ? availableWidth
          : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        if (
          this.hasAttribute("data-relationship-pill-measure") ||
          this.hasAttribute("data-relationship-overflow-measure")
        ) {
          return (this.textContent?.length ?? 0) * 8 + 16;
        }
        return 0;
      },
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = () => callback([], {} as ResizeObserver);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  beforeEach(() => {
    availableWidth = 400;
    resize = undefined;
  });

  afterAll(() => {
    if (originalClientWidth) {
      Object.defineProperty(
        HTMLElement.prototype,
        "clientWidth",
        originalClientWidth,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    }
    if (originalOffsetWidth) {
      Object.defineProperty(
        HTMLElement.prototype,
        "offsetWidth",
        originalOffsetWidth,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
    }
    vi.unstubAllGlobals();
  });

  it("shows every pill when they fit", () => {
    const { container } = render(
      <RelationshipPills
        items={[
          { id: "1", name: "First" },
          { id: "2", name: "Second" },
          { id: "3", name: "Third" },
        ]}
        totalCount={3}
      />,
    );
    const visiblePills = within(
      container.querySelector(
        "[data-relationship-pills-visible]",
      ) as HTMLElement,
    );

    expect(visiblePills.getByText("First")).toBeVisible();
    expect(visiblePills.getByText("Second")).toBeVisible();
    expect(visiblePills.getByText("Third")).toBeVisible();
    expect(visiblePills.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("collapses pills into a remaining count when the container shrinks", () => {
    const { container } = render(
      <RelationshipPills
        items={[
          { id: "1", name: "First" },
          { id: "2", name: "Second" },
          { id: "3", name: "Third" },
        ]}
        totalCount={3}
      />,
    );
    const visiblePills = within(
      container.querySelector(
        "[data-relationship-pills-visible]",
      ) as HTMLElement,
    );

    availableWidth = 100;
    act(() => resize?.());

    expect(visiblePills.getByText("First")).toBeVisible();
    expect(visiblePills.queryByText("Second")).not.toBeInTheDocument();
    expect(visiblePills.queryByText("Third")).not.toBeInTheDocument();
    expect(visiblePills.getByText("+2")).toBeVisible();
  });

  it("truncates the remaining pill only when its full label cannot fit", () => {
    availableWidth = 80;
    const { container } = render(
      <RelationshipPills
        items={[{ id: "1", name: "A very long evaluator name" }]}
        totalCount={1}
      />,
    );
    const pill = within(
      container.querySelector(
        "[data-relationship-pills-visible]",
      ) as HTMLElement,
    ).getByText("A very long evaluator name");

    expect(pill).toHaveClass("truncate");
  });

  it("shows a helpful empty label", () => {
    render(
      <RelationshipPills items={[]} totalCount={0} emptyLabel="No rules" />,
    );

    expect(screen.getByText("No rules")).toBeInTheDocument();
  });
});
