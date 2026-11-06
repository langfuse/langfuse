import { type ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { beforeAll, expect, it } from "vitest";
import { type TopicTracesResult } from "./facet-topics";
import { TopicMobileTraceList } from "./TopicMobileTraceList";

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

type Row = TopicTracesResult["rows"][number];

const rows: Row[] = Array.from({ length: 21 }, (_, index) => ({
  facetVersion: 1,
  traceId: `trace-${index}`,
  unitStartTime: "2026-10-20T12:00:00.000Z",
  summary: `Summary ${index}`,
  outcome: "assigned",
  topicId: "billing",
  topicName: "Billing",
}));

function traces(pageRows: Row[]): TopicTracesResult {
  return {
    rows: pageRows,
    isLoading: pageRows.length === 0,
    isLoadingMore: false,
    error: null,
    hasMore: false,
    loadMore: () => undefined,
  };
}

function list(
  props: Partial<ComponentProps<typeof TopicMobileTraceList>> & {
    pageRows?: Row[];
  },
) {
  const { pageRows = rows, ...rest } = props;
  return (
    <TopicMobileTraceList
      filterKey="all"
      traces={traces(pageRows)}
      selectedTraceId={null}
      onOpenTrace={() => undefined}
      {...rest}
    >
      {null}
    </TopicMobileTraceList>
  );
}

it("shows a trace selected after the first page", () => {
  const view = render(list({}));
  expect(
    screen.getByRole("button", { name: "Open trace trace-0" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Open trace trace-20" }),
  ).not.toBeInTheDocument();

  view.rerender(list({ selectedTraceId: "trace-20" }));
  expect(
    screen.getByRole("button", { name: "Open trace trace-20" }),
  ).toBeInTheDocument();

  view.rerender(list({ filterKey: "cleared", selectedTraceId: "trace-20" }));
  expect(
    screen.getByRole("button", { name: "Open trace trace-20" }),
  ).toBeInTheDocument();
});

it("opens the selected page when that trace loads after the list", () => {
  const view = render(list({ pageRows: [], selectedTraceId: "trace-20" }));
  expect(
    screen.queryByRole("button", { name: "Open trace trace-20" }),
  ).not.toBeInTheDocument();

  view.rerender(list({ selectedTraceId: "trace-20" }));
  expect(
    screen.getByRole("button", { name: "Open trace trace-20" }),
  ).toBeInTheDocument();
});
