import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TopicMobileTraceList } from "./TopicMobileTraceList";
import { type FacetRow } from "./facet-topics";

const rows: FacetRow[] = Array.from({ length: 45 }, (_, index) => ({
  traceId: `trace-${index}`,
  summary: `Summary ${index}`,
  topicId: null,
  topicName: null,
  outcome: "awaiting_map",
  facetVersion: 1,
  unitStartTime: "2026-10-20T12:00:00.000Z",
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});
afterEach(cleanup);

it("reveals changed selections without preventing manual pagination", () => {
  const props = {
    children: null,
    rows,
    filterKey: "all",
    selectedTraceId: "trace-0",
    onOpenTrace: vi.fn(),
  };
  const view = render(<TopicMobileTraceList {...props} />);
  view.rerender(<TopicMobileTraceList {...props} selectedTraceId="trace-24" />);
  expect(
    screen.getByRole("button", { name: "Open trace trace-24" }),
  ).toHaveAttribute("aria-current", "true");
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(
    screen.getByRole("button", { name: "Open trace trace-40" }),
  ).toBeInTheDocument();
  view.rerender(<TopicMobileTraceList {...props} selectedTraceId="trace-1" />);
  expect(
    screen.getByRole("button", { name: "Open trace trace-1" }),
  ).toHaveAttribute("aria-current", "true");
});

it("reveals the same selection after clearing filters and resets when absent", () => {
  const props = {
    children: null,
    rows: rows.slice(24),
    filterKey: "filtered",
    selectedTraceId: "trace-24",
    onOpenTrace: vi.fn(),
  };
  const view = render(<TopicMobileTraceList {...props} />);
  view.rerender(
    <TopicMobileTraceList {...props} rows={rows} filterKey="all" />,
  );
  expect(
    screen.getByRole("button", { name: "Open trace trace-24" }),
  ).toHaveAttribute("aria-current", "true");
  view.rerender(
    <TopicMobileTraceList
      {...props}
      rows={rows.slice(0, 24)}
      filterKey="without-selection"
    />,
  );
  expect(
    screen.getByRole("button", { name: "Open trace trace-0" }),
  ).toBeInTheDocument();
});
