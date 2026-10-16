import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DetailViewHeaderTitleRow } from "@/src/features/traces/components/DetailViewHeaderTitleRow";

// jsdom lays nothing out, so the measurements the row takes are stubbed:
// the row reports `headerWidth` from its bounding rect; the full cluster and
// icon-only cluster each report their width from `offsetWidth`, identified by
// their respective marker elements.
let headerWidth = 0;
let clusterWidth = 0;
let iconOnlyClusterWidth = 0;

const realRect = Element.prototype.getBoundingClientRect;
const realOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetWidth",
);

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const width = this.querySelector('[data-testid="title-marker"]')
      ? headerWidth
      : 0;
    return {
      x: 0,
      y: 0,
      width,
      height: 0,
      top: 0,
      right: width,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      if (this.querySelector('[data-testid="cluster-marker"]'))
        return clusterWidth;
      if (this.querySelector('[data-testid="icon-only-cluster-marker"]'))
        return iconOnlyClusterWidth;
      return 0;
    },
  });
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = realRect;
  if (realOffsetWidth) {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      ...realOffsetWidth,
      configurable: true,
    });
  }
});

function Row({
  actionsKey,
  withIconOnly = false,
}: {
  actionsKey: string;
  withIconOnly?: boolean;
}) {
  return (
    <DetailViewHeaderTitleRow
      alwaysFold={false}
      actionsKey={actionsKey}
      title={<span data-testid="title-marker">title</span>}
      options={<button aria-label="Options" />}
      foldedActions={<button aria-label="More actions" />}
      actions={
        <span data-testid="cluster-marker">
          <button aria-label="Annotate" />
        </span>
      }
      iconOnlyActions={
        withIconOnly ? (
          <span data-testid="icon-only-cluster-marker">
            <button aria-label="Annotate icon-only" />
          </span>
        ) : undefined
      }
    />
  );
}

// The detail pane's 360px floor leaves 328px of header. `Add to · Annotate ·
// Comment` measures 312px there; a comment count pushes it past what fits.
const PANE_FLOOR_HEADER_WIDTH = 328;

describe("DetailViewHeaderTitleRow", () => {
  it("folds a cluster the header cannot fit, rather than letting it wrap", () => {
    headerWidth = PANE_FLOOR_HEADER_WIDTH;
    clusterWidth = 344;

    render(<Row actionsKey="a" />);

    expect(screen.getByLabelText("More actions")).toBeInTheDocument();
    expect(screen.queryByTestId("cluster-marker")).not.toBeInTheDocument();
  });

  it("brings a folded cluster back once its content gets narrower", () => {
    headerWidth = PANE_FLOOR_HEADER_WIDTH;
    clusterWidth = 344;

    const { rerender } = render(<Row actionsKey="a" />);
    expect(screen.getByLabelText("More actions")).toBeInTheDocument();

    // Moving to an entity whose cluster fits — no comment count, say. A folded
    // cluster is unmounted and cannot be measured, so without the key change
    // the row would keep planning from the stale 344 and stay folded.
    clusterWidth = 312;
    rerender(<Row actionsKey="b" />);

    expect(screen.getByLabelText("Options")).toBeInTheDocument();
    expect(screen.getByTestId("cluster-marker")).toBeInTheDocument();
  });

  it("follows the keyboard from a cluster it folds to the menu that replaces it", () => {
    headerWidth = 900;
    clusterWidth = 312;

    const { rerender } = render(<Row actionsKey="a" />);
    screen.getByLabelText("Annotate").focus();
    expect(document.activeElement).toBe(screen.getByLabelText("Annotate"));

    // The pane narrows under it — opening the review panel does exactly this.
    headerWidth = PANE_FLOOR_HEADER_WIDTH;
    clusterWidth = 344;
    rerender(<Row actionsKey="b" />);

    expect(screen.getByLabelText("More actions")).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText("More actions"));
  });

  it("keeps the cluster beside the title when the header is wide", () => {
    headerWidth = 900;
    clusterWidth = 312;

    render(<Row actionsKey="a" />);

    expect(screen.getByLabelText("Options")).toBeInTheDocument();
    expect(screen.getByTestId("cluster-marker")).toBeInTheDocument();
  });

  describe("icon-only intermediate step", () => {
    it("shows icon-only buttons when the full cluster overflows but icon-only fits", () => {
      headerWidth = PANE_FLOOR_HEADER_WIDTH;
      clusterWidth = 344;
      iconOnlyClusterWidth = 100;

      render(<Row actionsKey="a" withIconOnly />);

      // foldedActions (More actions) must NOT be shown.
      expect(screen.queryByLabelText("More actions")).not.toBeInTheDocument();
      // The icon-only cluster must be accessible.
      expect(screen.getByLabelText("Annotate icon-only")).toBeInTheDocument();
      // The icon-only cluster container must NOT be aria-hidden.
      expect(
        screen.getByTestId("icon-only-cluster-marker").closest("[aria-hidden]"),
      ).toBeNull();
      // The full cluster is still in the DOM (for measurement) but must be
      // aria-hidden so AT does not present its buttons alongside the icon-only
      // equivalents.
      expect(
        screen
          .getByTestId("cluster-marker")
          .closest("[aria-hidden]")
          ?.getAttribute("aria-hidden"),
      ).toBe("true");
    });

    it("folds to ellipsis when even icon-only does not fit", () => {
      headerWidth = 80;
      clusterWidth = 344;
      iconOnlyClusterWidth = 100;

      render(<Row actionsKey="a" withIconOnly />);

      expect(screen.getByLabelText("More actions")).toBeInTheDocument();
      expect(screen.queryByTestId("cluster-marker")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("icon-only-cluster-marker"),
      ).not.toBeInTheDocument();
    });

    it("restores full labels from icon-only when the key changes and cluster narrows", () => {
      headerWidth = PANE_FLOOR_HEADER_WIDTH;
      clusterWidth = 344;
      iconOnlyClusterWidth = 100;

      const { rerender } = render(<Row actionsKey="a" withIconOnly />);
      expect(screen.getByLabelText("Annotate icon-only")).toBeInTheDocument();

      // Switching entity brings a narrower full cluster — full labels come back.
      clusterWidth = 312;
      rerender(<Row actionsKey="b" withIconOnly />);

      expect(screen.getByLabelText("Options")).toBeInTheDocument();
      expect(screen.getByTestId("cluster-marker")).toBeInTheDocument();
    });
  });
});
