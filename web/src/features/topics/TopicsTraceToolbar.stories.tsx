import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import {
  QueryParamProvider,
  type QueryParamAdapterComponent,
} from "use-query-params";
import preview from "../../../.storybook/preview";
import { DataTable } from "@/src/components/table/data-table";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { TopicsTraceToolbar } from "./TopicsTraceToolbar";
import { filterTopicTraces } from "./topic-trace-filters";
import { useTopicTraceFilters } from "./useTopicTraceFilters";

const facetPersistenceProject = "storybook-topics-toolbar-facet-persistence";
const facets = [{ facetId: "intent" }, { facetId: "sentiment" }];

const MemoryQueryAdapter: QueryParamAdapterComponent = ({ children }) => {
  const [location, setLocation] = useState({ search: "" });
  return children({ location, replace: setLocation, push: setLocation });
};

function FacetToolbarExample() {
  const state = useTopicTraceFilters(facetPersistenceProject, facets);
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <Tabs
        value={state.selectedFacetId ?? facets[0].facetId}
        onValueChange={state.selectFacet}
      >
        <Tabs.List variant="underline">
          <Tabs.Trigger value="intent" label="Intent" />
          <Tabs.Trigger value="sentiment" label="Sentiment" />
        </Tabs.List>
      </Tabs>
      <TopicsTraceToolbar
        topics={topics}
        filters={state.filters}
        searchQuery={state.searchQuery}
        onFiltersChange={state.setFilters}
        onSearchQueryChange={state.setSearchQuery}
      />
    </div>
  );
}

const topics = [
  { id: "billing", name: "Billing questions" },
  { id: "setup", name: "Project setup" },
];
const rows = [
  {
    traceId: "trace-1",
    summary: "Refund an invoice",
    topicId: "billing",
    topicName: "Billing questions",
    outcome: "assigned",
  },
  {
    traceId: "trace-2",
    summary: "Create a project",
    topicId: "setup",
    topicName: "Project setup",
    outcome: "assigned",
  },
  {
    traceId: "trace-3",
    summary: "Refund a subscription",
    topicId: null,
    topicName: null,
    outcome: "outlier",
  },
  {
    traceId: "trace-4",
    summary: null,
    topicId: null,
    topicName: null,
    outcome: "insufficient_input",
  },
];

function ToolbarExample(args: ComponentProps<typeof TopicsTraceToolbar>) {
  const [filters, setFilters] = useState(args.filters);
  const [searchQuery, setSearchQuery] = useState(args.searchQuery);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const matches = filterTopicTraces(rows, filters, searchQuery);
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <TopicsTraceToolbar
        {...args}
        filters={filters}
        searchQuery={searchQuery}
        onFiltersChange={(next) => {
          setFilters(next);
          args.onFiltersChange(next);
        }}
        onSearchQueryChange={(next) => {
          setSearchQuery(next);
          args.onSearchQueryChange(next);
        }}
      />
      <DataTable
        tableName="topics-toolbar-example"
        columns={[
          {
            accessorKey: "summary",
            header: "Summary",
            cell: ({ row }) => row.original.summary ?? row.original.traceId,
          },
        ]}
        data={{ isLoading: false, isError: false, data: matches }}
        pagination={{
          totalCount: matches.length,
          resultCountLabel: `${matches.length} of ${rows.length} traces`,
          state: pagination,
          onChange: setPagination,
        }}
        noResultsMessage="No matches. Adjust or clear your filters."
      />
    </div>
  );
}

const meta = preview.meta({
  component: TopicsTraceToolbar,
  args: {
    topics,
    filters: [],
    searchQuery: null,
    onFiltersChange: fn(),
    onSearchQueryChange: fn(),
  },
  render: (args) => <ToolbarExample {...args} />,
});

export const Default = meta.story({});
export const WithFilters = meta.story({
  args: {
    filters: [
      {
        column: "assignment",
        type: "stringOptions",
        operator: "any of",
        value: ["outlier"],
      },
    ],
    searchQuery: "refund",
  },
});
export const NoMatches = meta.story({ args: { searchQuery: "missing trace" } });

async function replaceQuery(search: HTMLElement, query: string) {
  await userEvent.click(search);
  await userEvent.clear(search);
  if (query) await userEvent.type(search, query);
  await userEvent.keyboard("{Enter}");
}

export const SearchAndClear = meta.story({
  name: "(Test) Search, Combine Filters and Clear",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole("combobox", { name: "Search" });
    await replaceQuery(search, "invoice");
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("1 of 4 traces"),
    );
    await replaceQuery(
      search,
      'topic:("Billing questions" OR "Project setup") assignment:Outlier invoice',
    );
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("0 of 4 traces"),
    );
    await expect(
      canvas.getByText("No matches. Adjust or clear your filters."),
    ).toBeVisible();
    await expect(search).toHaveTextContent("invoice");
    await expect(search).not.toHaveTextContent("in:");
    await expect(args.onFiltersChange).toHaveBeenLastCalledWith([
      {
        column: "topicId",
        type: "stringOptions",
        operator: "any of",
        value: ["billing", "setup"],
      },
      {
        column: "assignment",
        type: "stringOptions",
        operator: "any of",
        value: ["outlier"],
      },
    ]);
    await expect(args.onSearchQueryChange).toHaveBeenLastCalledWith("invoice");
    await replaceQuery(search, "");
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("4 of 4 traces"),
    );
  },
});

export const Exclusions = meta.story({
  name: "(Test) Exclusions Can Be Removed",
  args: {
    filters: [
      {
        column: "assignment",
        type: "stringOptions",
        operator: "none of",
        value: ["outlier", "no_topic"],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("2 of 4 traces");
    await userEvent.hover(canvas.getByTestId("search-bar-token"));
    await userEvent.click(
      await canvas.findByRole("button", { name: /Remove -assignment/ }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("4 of 4 traces"),
    );
  },
});

export const TopicAutocomplete = meta.story({
  name: "(Test) Topic Autocomplete Uses Stable IDs",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const search = canvas.getByRole("combobox", { name: "Search" });
    await userEvent.click(search);
    await userEvent.type(search, "topic:");
    const option = await body.findByRole("option", {
      name: /Billing questions/,
    });
    await expect(
      body.getByRole("option", { name: /Project setup/ }),
    ).toBeVisible();
    await expect(option.closest(".ph-no-capture")).not.toBeNull();
    await userEvent.click(option);
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("1 of 4 traces"),
    );
    await expect(args.onFiltersChange).toHaveBeenLastCalledWith([
      {
        column: "topicId",
        type: "stringOptions",
        operator: "any of",
        value: ["billing"],
      },
    ]);
    await expect(canvas.getByTestId("search-bar-token")).toHaveTextContent(
      'topic:"Billing questions"',
    );
  },
});

export const UnsupportedRestoredFilter = meta.story({
  name: "(Test) Unsupported Restored Filter Can Be Cleared",
  args: {
    filters: [{ column: "topicId", type: "number", operator: "=", value: 1 }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("0 of 4 traces");
    await replaceQuery(canvas.getByRole("combobox", { name: "Search" }), "");
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("4 of 4 traces"),
    );
  },
});

export const FacetFiltersPersist = meta.story({
  name: "(Test) Facets Remember Their Filters",
  beforeEach: () => {
    const storageKey = "topics-trace-filters-v1";
    const snapshots = JSON.parse(
      localStorage.getItem(storageKey) ?? "{}",
    ) as Record<string, unknown>;
    for (const { facetId } of facets) {
      delete snapshots[JSON.stringify([facetPersistenceProject, facetId])];
    }
    localStorage.setItem(storageKey, JSON.stringify(snapshots));
  },
  render: () => (
    <QueryParamProvider
      adapter={MemoryQueryAdapter}
      options={{ enableBatching: true }}
    >
      <FacetToolbarExample />
    </QueryParamProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole("combobox", { name: "Search" });
    await replaceQuery(search, 'topic:"Billing questions" invoice');
    await waitFor(() => expect(search).toHaveTextContent("invoice"));
    await userEvent.click(canvas.getByRole("tab", { name: "Sentiment" }));
    await waitFor(() => {
      expect(search).not.toHaveTextContent("invoice");
      expect(canvas.queryByTestId("search-bar-token")).not.toBeInTheDocument();
    });
    await replaceQuery(search, "assignment:Outlier subscription");
    await waitFor(() => expect(search).toHaveTextContent("subscription"));
    await userEvent.click(canvas.getByRole("tab", { name: "Intent" }));
    await waitFor(() => {
      expect(search).toHaveTextContent("invoice");
      expect(search).toHaveTextContent('topic:"Billing questions"');
      expect(search).not.toHaveTextContent("subscription");
    });
    await userEvent.click(canvas.getByRole("tab", { name: "Sentiment" }));
    await waitFor(() => {
      expect(search).toHaveTextContent("subscription");
      expect(search).toHaveTextContent("assignment:Outlier");
      expect(search).not.toHaveTextContent("invoice");
    });
  },
});
