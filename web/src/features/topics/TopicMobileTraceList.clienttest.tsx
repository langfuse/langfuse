import { type ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { beforeAll, expect, it } from "vitest";
import { TopicMobileTraceList } from "./TopicMobileTraceList";

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

type Row = ComponentProps<typeof TopicMobileTraceList>["rows"][number];

const rows: Row[] = Array.from({ length: 21 }, (_, index) => ({
  facetVersion: 1,
  traceId: `trace-${index}`,
  unitStartTime: "2026-10-20T12:00:00.000Z",
  summary: `Summary ${index}`,
  outcome: "assigned",
  topicId: "billing",
  topicName: "Billing",
}));

it("shows a trace selected after the first page", () => {
  const view = render(
    <TopicMobileTraceList
      filterKey="all"
      rows={rows}
      selectedTraceId={null}
      onOpenTrace={() => undefined}
    >
      {null}
    </TopicMobileTraceList>,
  );
  expect(
    screen.getByRole("button", { name: "Open trace trace-0" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Open trace trace-20" }),
  ).not.toBeInTheDocument();

  view.rerender(
    <TopicMobileTraceList
      filterKey="all"
      rows={rows}
      selectedTraceId="trace-20"
      onOpenTrace={() => undefined}
    >
      {null}
    </TopicMobileTraceList>,
  );
  expect(
    screen.getByRole("button", { name: "Open trace trace-20" }),
  ).toBeInTheDocument();
});
