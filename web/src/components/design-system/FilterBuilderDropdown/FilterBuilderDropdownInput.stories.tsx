import { useState } from "react";
import { type FilterState } from "@langfuse/shared";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "@/.storybook/preview";
import { FilterBuilderDropdown } from "./FilterBuilderDropdown";

const meta = preview.meta({
  args: { onAnalyticsEvent: fn() },
  render: function Render({ onAnalyticsEvent }) {
    const [value, setValue] = useState<FilterState>([]);

    return (
      <div className="w-fit">
        <FilterBuilderDropdown
          value={value}
          onChange={setValue}
          onAnalyticsEvent={onAnalyticsEvent}
          columns={[
            {
              id: "name",
              name: "Name",
              type: "string",
              internal: "internalValue",
            },
          ]}
        />
      </div>
    );
  },
});

export const Summary = meta.story({
  render: function Render() {
    const [value, setValue] = useState<FilterState>([
      { column: "Name", type: "string", operator: "=", value: "chat" },
    ]);

    return (
      <FilterBuilderDropdown
        variant="summary"
        summary={[
          {
            column: "Name",
            operator: "=",
            value: '"chat"',
            numericValue: false,
          },
        ]}
        value={value}
        onChange={setValue}
        columns={[
          { id: "name", name: "Name", type: "string", internal: "name" },
        ]}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Filters (1)" }),
    ).toHaveTextContent('Name = "chat"');
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear all filters" }),
    );
    await expect(canvas.getByRole("button", { name: "Filters" })).toBeVisible();
  },
});

export const ReplaceOpenDraft = meta.story({
  render: function Render({ onAnalyticsEvent }) {
    const [value, setValue] = useState<FilterState>([]);
    return (
      <FilterBuilderDropdown
        value={value}
        onChange={setValue}
        onAnalyticsEvent={onAnalyticsEvent}
        columns={[
          { id: "name", name: "Name", type: "string", internal: "name" },
        ]}
        getColumnNotice={() => ({ severity: "info", message: "Column notice" })}
        renderAddon={({ replaceFilters }) => (
          <button
            type="button"
            onClick={() =>
              replaceFilters([
                {
                  column: "Name",
                  type: "string",
                  operator: "=",
                  value: "generated",
                },
              ])
            }
          >
            Replace filters
          </button>
        )}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));
    await userEvent.click(
      await page.findByRole("button", { name: "Add filter" }),
    );
    await userEvent.click(
      page.getByRole("button", { name: "Replace filters" }),
    );
    await expect(page.getByRole("textbox", { name: "Value" })).toHaveValue(
      "generated",
    );
    await expect(page.getByText("Column notice")).toBeVisible();
    await expect(page.getAllByLabelText("Column")).toHaveLength(1);
    await expect(
      canvas.getByRole("button", { name: "Filters (1)" }),
    ).toBeVisible();
    await expect(args.onAnalyticsEvent).toHaveBeenCalledTimes(1);
    await expect(args.onAnalyticsEvent).toHaveBeenCalledWith({
      type: "opened",
    });
  },
});

export const Default = meta.story({
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Filters" }));
    await userEvent.click(await page.findByLabelText("Column"));
    await userEvent.click(await page.findByRole("option", { name: "Name" }));
    await expect(args.onAnalyticsEvent).toHaveBeenCalledTimes(1);
    await userEvent.type(
      await page.findByRole("textbox", { name: "Value" }),
      "chat",
    );
    await expect(
      canvas.getByRole("button", { name: "Filters (1)" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear all filters" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Filters" }),
    ).toBeInTheDocument();
    await expect(args.onAnalyticsEvent).toHaveBeenCalledTimes(4);
    await expect(args.onAnalyticsEvent).toHaveBeenNthCalledWith(1, {
      type: "opened",
    });
    await expect(args.onAnalyticsEvent).toHaveBeenNthCalledWith(2, {
      type: "applied",
      column: "Name",
      filterType: "string",
      operator: "=",
      valueCount: 1,
      conditionCount: 1,
      columnConditionCount: 1,
    });
    await expect(args.onAnalyticsEvent).toHaveBeenNthCalledWith(3, {
      type: "closed",
      filterCount: 1,
    });
    await expect(args.onAnalyticsEvent).toHaveBeenNthCalledWith(4, {
      type: "cleared",
      clearedCount: 1,
    });
  },
});
