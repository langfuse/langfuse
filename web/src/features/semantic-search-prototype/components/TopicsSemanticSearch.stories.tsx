import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import {
  FULL_COVERAGE,
  KEYWORD_MATCHES,
  PARTIAL_COVERAGE,
  REFUND_MATCHES,
  SUGGESTED_QUERIES,
} from "../lib/fixtures";
import { mockTopicSearch } from "../lib/mockBackend";
import { type TopicSearchStatus } from "../types";
import { TopicsSemanticSearch } from "./TopicsSemanticSearch";

function InteractiveSearch(args: ComponentProps<typeof TopicsSemanticSearch>) {
  const [mode, setMode] = useState(args.mode);
  const [query, setQuery] = useState(args.query);
  const [status, setStatus] = useState(args.status);
  return (
    <TopicsSemanticSearch
      {...args}
      mode={mode}
      query={query}
      status={status}
      onModeChange={(next) => {
        setMode(next);
        setStatus(mockTopicSearch(next, query));
        args.onModeChange(next);
      }}
      onQueryChange={(next) => {
        setQuery(next);
        args.onQueryChange(next);
      }}
      onSubmit={(next) => {
        setStatus(mockTopicSearch(mode, next));
        args.onSubmit(next);
      }}
    />
  );
}

/**
 * Search by meaning inside a Topics analysis: rank traces by how close their
 * facet summary is to the query, next to today's keyword search.
 */
const meta = preview.meta({
  component: TopicsSemanticSearch,
  args: {
    mode: "meaning" as const,
    query: "",
    facetLabel: "Intent",
    status: { kind: "idle" } satisfies TopicSearchStatus,
    suggestions: SUGGESTED_QUERIES,
    onModeChange: fn(),
    onQueryChange: fn(),
    onSubmit: fn(),
    onOpenTrace: fn(),
    onTopicSelect: fn(),
    onOpenInTracing: fn(),
  },
});

export const Default = meta.story({});

export const Searching = meta.story({
  args: {
    query: "refund to expired card",
    status: { kind: "searching" } satisfies TopicSearchStatus,
  },
});

export const Results = meta.story({
  args: {
    query: "refund to expired card",
    status: {
      kind: "results",
      matches: REFUND_MATCHES,
      coverage: FULL_COVERAGE,
    } satisfies TopicSearchStatus,
  },
});

/** Topics has only summarized part of the range, so matches are incomplete. */
export const LowCoverage = meta.story({
  args: {
    query: "refund to expired card",
    status: {
      kind: "results",
      matches: REFUND_MATCHES,
      coverage: PARTIAL_COVERAGE,
    } satisfies TopicSearchStatus,
  },
});

export const KeywordResults = meta.story({
  args: {
    mode: "keyword" as const,
    query: "refund",
    status: {
      kind: "results",
      matches: KEYWORD_MATCHES,
      coverage: FULL_COVERAGE,
    } satisfies TopicSearchStatus,
  },
});

export const Empty = meta.story({
  args: {
    query: "pricing for enterprise plans",
    status: {
      kind: "empty",
      coverage: FULL_COVERAGE,
    } satisfies TopicSearchStatus,
  },
});

export const TopicsNotSetUp = meta.story({
  args: { status: { kind: "unavailable" } satisfies TopicSearchStatus },
});

export const Error = meta.story({
  args: {
    query: "refund to expired card",
    status: { kind: "error" } satisfies TopicSearchStatus,
  },
});

/** Try "refund to expired card", "locked out after changing phone", or switch to Keyword. */
export const Interactive = meta.story({
  render: (args) => <InteractiveSearch {...args} />,
});

export const SearchByMeaning = meta.story({
  name: "(Test) Meaning Finds What Keyword Misses",
  render: (args) => <InteractiveSearch {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("searchbox"),
      "refund to expired card{Enter}",
    );
    await expect(canvas.getByText("Top 7 by meaning")).toBeVisible();
    await expect(canvas.getAllByRole("listitem")).toHaveLength(7);
    await userEvent.click(
      canvas.getByRole("button", { name: /Refund status questions/ }),
    );
    await expect(args.onTopicSelect).toHaveBeenCalledWith("refund-status");
    await userEvent.click(canvas.getByRole("tab", { name: "Keyword" }));
    await expect(
      canvas.getByText(/No summaries contain “refund to expired card”/),
    ).toBeVisible();
  },
});
