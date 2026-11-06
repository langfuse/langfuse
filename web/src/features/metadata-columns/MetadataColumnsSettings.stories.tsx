import { useState, type SetStateAction } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { type FilterState } from "@langfuse/shared";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/DataTableColumnVisibilityFilter";
import { Button } from "@/src/components/design-system/Button/Button";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { MetadataColumnsSettings } from "./MetadataColumnsSettings";
import { createMetadataColumns } from "./createMetadataColumns";
import { useMetadataColumns } from "./useMetadataColumns";
import {
  getMetadataColumnId,
  getMetadataColumnVisibility,
  mergeMetadataColumnOrder,
  parseMetadataRecord,
  stripMetadataColumnOrder,
  stripMetadataColumnVisibility,
  updateMetadataColumnOrder,
  updateMetadataColumnVisibility,
} from "./metadata-columns";

const rows = [
  {
    id: "trace-1",
    name: "Review agent",
    parsedMetadata: parseMetadataRecord(
      JSON.stringify({
        repo: "sample-agent",
        tools: ["git", "search"],
        "gen_ai.request.model": "gpt-example",
        attempts: 0,
        approved: false,
        status: { type: "loading" },
      }),
    ),
  },
  {
    id: "trace-2",
    name: "Documentation agent",
    parsedMetadata: parseMetadataRecord(
      JSON.stringify({
        repo: "docs-agent",
        tools: ["search"],
        attempts: 2,
        approved: true,
        status: null,
      }),
    ),
  },
];

const initialFilters: FilterState = [
  {
    column: "metadata",
    type: "stringObject",
    key: "gen_ai.request.model",
    operator: "starts with",
    value: "gpt",
  },
  {
    column: "metadata",
    type: "stringObject",
    key: "host",
    operator: "=",
    value: "worker-1",
  },
  {
    column: "environment",
    type: "stringOptions",
    operator: "any of",
    value: ["production"],
  },
];

const meta = preview.meta({
  component: MetadataColumnsSettings,
  args: {
    metadataColumns: [
      { key: "repo", label: "Repository", visible: true, position: 1 },
      { key: "attempts", visible: true, position: 2 },
      { key: "approved", visible: true, position: 3 },
      { key: "status", visible: true, position: 4 },
      { key: "tools", visible: true, position: 5 },
    ],
    keyOptions: [
      "repo",
      "tools",
      "gen_ai.request.model",
      "attempts",
      "approved",
      "status",
    ],
    baseColumnCount: 1,
    filterState: initialFilters,
    onChange: fn(),
    onFilterChange: fn(),
  },
  render: (args) => {
    const [projectId, setProjectId] = useState("metadata-columns-example-a");
    const { metadataColumns, setMetadataColumns } = useMetadataColumns(
      projectId,
      true,
    );
    const [filterState, setFilterState] = useState(args.filterState);
    const baseColumns = [
      createTextTableColumn<(typeof rows)[number]>({
        accessorKey: "name",
        header: "Trace",
      }),
    ];
    const columns = [
      ...baseColumns,
      ...createMetadataColumns<(typeof rows)[number]>({
        metadataColumns,
        isIoPending: () => false,
        singleLine: true,
      }),
    ];
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            text="Load example columns"
            variant="outline"
            onClick={() => setMetadataColumns(args.metadataColumns)}
          />
          <Button
            text="Clear local columns"
            variant="outline"
            onClick={() => setMetadataColumns([])}
          />
          <Button
            text="Switch project"
            variant="outline"
            onClick={() =>
              setProjectId(
                projectId === "metadata-columns-example-a"
                  ? "metadata-columns-example-b"
                  : "metadata-columns-example-a",
              )
            }
          />
          <span className="text-muted-foreground text-xs">{projectId}</span>
        </div>
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="w-80 shrink-0">
            <MetadataColumnsSettings
              {...args}
              metadataColumns={metadataColumns}
              filterState={filterState}
              onChange={(next) => {
                setMetadataColumns(next);
                args.onChange(next);
              }}
              onFilterChange={(next) => {
                setFilterState(next);
                args.onFilterChange(next);
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <DataTable
              tableName="metadata-columns-story"
              columns={columns}
              data={{ isLoading: false, isError: false, data: rows }}
              columnVisibility={getMetadataColumnVisibility(metadataColumns)}
              columnOrder={mergeMetadataColumnOrder(["name"], metadataColumns)}
              rowHeight="s"
              hidePagination
            />
          </div>
        </div>
      </div>
    );
  },
});

export const Default = meta.story({});

export const ConfigureAndFilter = meta.story({
  name: "(Test) Configure and filter",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear local columns" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Load example columns" }),
    );
    await expect(canvas.getByText("0", { exact: true })).toBeVisible();
    await expect(canvas.getByText("false", { exact: true })).toBeVisible();
    await expect(canvas.getByText(/"type":\s*"loading"/)).toBeVisible();
    await expect(
      canvas.getByText('["git","search"]', { exact: true }),
    ).toBeVisible();

    const keyInput = canvas.getByRole("textbox", {
      name: /^Metadata key$/,
    });
    await userEvent.type(keyInput, "repo");
    await expect(
      canvas.getByRole("button", { name: "Add metadata column" }),
    ).toBeDisabled();
    await userEvent.clear(keyInput);
    await userEvent.type(keyInput, "gen_ai.request.model");
    await userEvent.click(
      canvas.getByRole("button", { name: "Add metadata column" }),
    );
    const label = canvas.getByRole("textbox", {
      name: "Display label for gen_ai.request.model",
    });
    await userEvent.type(label, "Model name");
    await expect(
      canvas.getByRole("columnheader", { name: /Model name/ }),
    ).toBeVisible();
    await expect(
      canvas.getByText('"gpt-example"', { exact: true }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Switch project" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear local columns" }),
    );
    await expect(
      canvas.queryByRole("columnheader", { name: /Model name/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Switch project" }),
    );
    await expect(
      canvas.getByRole("columnheader", { name: /Model name/ }),
    ).toBeVisible();

    const filterButtons = canvas.getAllByRole("button", {
      name: /^Filter$/,
    });
    await userEvent.click(filterButtons[filterButtons.length - 1]!);
    await expect(canvas.getByPlaceholderText("Metadata key")).toHaveValue(
      "gen_ai.request.model",
    );
    await userEvent.type(canvas.getByPlaceholderText("Value"), "gpt");
    await userEvent.click(canvas.getByRole("button", { name: "Apply filter" }));
    await expect(args.onFilterChange).toHaveBeenLastCalledWith([
      ...initialFilters,
      {
        column: "metadata",
        type: "stringObject",
        key: "gen_ai.request.model",
        operator: "contains",
        value: "gpt",
      },
    ]);
    const removeButtons = canvas.getAllByRole("button", {
      name: "Remove column",
    });
    await userEvent.click(removeButtons[removeButtons.length - 1]!);
    await expect(
      canvas.queryByRole("columnheader", { name: /Model name/ }),
    ).not.toBeInTheDocument();
    await expect(args.onFilterChange).toHaveBeenCalledTimes(1);
  },
});

export const ConfigureInColumnsMenu = meta.story({
  name: "(Test) Configure in columns menu",
  args: {
    metadataColumns: [
      { key: "repo", label: "Repository", visible: true, position: 1 },
    ],
  },
  render: (args) => {
    const [metadataColumns, setMetadataColumns] = useState(
      args.metadataColumns,
    );
    const [filterState, setFilterState] = useState(args.filterState);
    const [baseOrder, setBaseOrder] = useState(["name"]);
    const [baseVisibility, setBaseVisibility] = useState<
      Record<string, boolean>
    >({ name: true });
    const columns = [
      createTextTableColumn<(typeof rows)[number]>({
        accessorKey: "name",
        header: "Trace",
      }),
      ...createMetadataColumns<(typeof rows)[number]>({
        metadataColumns,
        isIoPending: () => false,
        singleLine: true,
      }),
    ];
    const columnOrder = mergeMetadataColumnOrder(baseOrder, metadataColumns);
    const columnVisibility = {
      ...baseVisibility,
      ...getMetadataColumnVisibility(metadataColumns),
    };
    const onColumnOrderChange = (update: SetStateAction<string[]>) => {
      const next = typeof update === "function" ? update(columnOrder) : update;
      setBaseOrder(stripMetadataColumnOrder(next));
      setMetadataColumns(updateMetadataColumnOrder(metadataColumns, next));
    };
    const onColumnVisibilityChange = (
      update: SetStateAction<Record<string, boolean>>,
    ) => {
      const next =
        typeof update === "function" ? update(columnVisibility) : update;
      setBaseVisibility(stripMetadataColumnVisibility(next));
      setMetadataColumns(updateMetadataColumnVisibility(metadataColumns, next));
    };
    return (
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <DataTableColumnVisibilityFilter
            columns={columns}
            columnOrder={columnOrder}
            setColumnOrder={onColumnOrderChange}
            columnVisibility={columnVisibility}
            setColumnVisibility={onColumnVisibilityChange}
            tableName="observations-events"
            isV4
            additionalColumnSettings={{
              isDefault: metadataColumns.length === 0,
              onRestoreDefaults: () => setMetadataColumns([]),
              content: (
                <MetadataColumnsSettings
                  {...args}
                  metadataColumns={metadataColumns}
                  onChange={setMetadataColumns}
                  filterState={filterState}
                  onFilterChange={(next) => {
                    setFilterState(next);
                    args.onFilterChange(next);
                  }}
                />
              ),
            }}
          />
        </div>
        <DataTable
          tableName="metadata-columns-menu-story"
          columns={columns}
          columnOrder={columnOrder}
          onColumnOrderChange={onColumnOrderChange}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={onColumnVisibilityChange}
          data={{ isLoading: false, isError: false, data: rows }}
          rowHeight="s"
          hidePagination
        />
      </div>
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: /^Columns/ }));
    const keyInput = page.getByRole("textbox", { name: /^Metadata key$/ });
    keyInput.scrollIntoView({ block: "center" });
    await userEvent.type(keyInput, "gen_ai.request.model");
    await userEvent.click(
      page.getByRole("button", { name: "Add metadata column" }),
    );
    const label = page.getByRole("textbox", {
      name: "Display label for gen_ai.request.model",
    });
    label.scrollIntoView({ block: "center" });
    await userEvent.type(label, "Model");
    const filters = page.getAllByRole("button", { name: /^Filter$/ });
    await userEvent.click(filters[filters.length - 1]!);
    const additionalConditions = page.getByText(
      "Other conditions for this key are still applied. Edit them in the filter sidebar.",
    );
    additionalConditions.scrollIntoView({ block: "center" });
    await waitFor(() => expect(additionalConditions).toBeVisible());
    const value = page.getByPlaceholderText("Value");
    value.scrollIntoView({ block: "center" });
    await userEvent.type(value, "gpt");
    await userEvent.click(page.getByRole("button", { name: "Apply filter" }));
    await expect(args.onFilterChange).toHaveBeenLastCalledWith([
      ...initialFilters,
      {
        column: "metadata",
        type: "stringObject",
        key: "gen_ai.request.model",
        operator: "contains",
        value: "gpt",
      },
    ]);
    const checkbox = page.getByRole("checkbox", { name: "Model" });
    checkbox.scrollIntoView({ block: "center" });
    await userEvent.click(checkbox);
    await expect(
      canvas.queryByRole("columnheader", { name: /Model/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(checkbox);
    await expect(
      canvas.getByRole("columnheader", { name: /Model/ }),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        page.queryByRole("textbox", { name: /^Metadata key$/ }),
      ).not.toBeInTheDocument(),
    );

    const header = canvas.getByRole("columnheader", { name: /Model/ });
    const cell = canvas.getByText('"gpt-example"').closest("td");
    const resizeHandle =
      header.querySelector<HTMLElement>(".cursor-col-resize");
    if (!cell || !resizeHandle)
      throw new Error("Metadata resize target missing");
    const widthVariable = `--header-${getMetadataColumnId("gen_ai.request.model")}-size`;
    const initialWidth = header.getBoundingClientRect().width;
    await expect(getComputedStyle(header).getPropertyValue(widthVariable)).toBe(
      "220",
    );
    await expect(cell.getBoundingClientRect().width).toBe(initialWidth);
    const bounds = resizeHandle.getBoundingClientRect();
    const coords = { x: bounds.left + bounds.width / 2, y: bounds.top + 5 };
    await userEvent.pointer([
      { keys: "[MouseLeft>]", target: resizeHandle, coords },
      { coords: { ...coords, x: coords.x + 80 } },
      { keys: "[/MouseLeft]" },
    ]);
    await waitFor(() => {
      expect(getComputedStyle(header).getPropertyValue(widthVariable)).toBe(
        "300",
      );
      expect(header.getBoundingClientRect().width).toBeGreaterThan(
        initialWidth,
      );
      const resizedCell = canvas.getByText('"gpt-example"').closest("td");
      expect(resizedCell?.getBoundingClientRect().width).toBe(
        header.getBoundingClientRect().width,
      );
    });
  },
});
