import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button } from "@/src/components/design-system/Button/Button";
import preview from "../../../.storybook/preview";
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

const meta = preview.meta({
  component: TopicMobileTraceList,
  args: {
    children: null,
    rows,
    filterKey: "all",
    selectedTraceId: null,
    onOpenTrace: fn(),
  },
});

export const Default = meta.story({});

export const FollowSelection = meta.story({
  name: "(Test) Follow selection and filters while allowing manual pagination",
  render: function SelectionExample(args) {
    const [selectedTraceId, setSelectedTraceId] = useState("trace-24");
    const [filter, setFilter] = useState("tail");
    let visible = rows;
    if (filter === "tail") visible = rows.slice(24);
    if (filter === "first") visible = rows.slice(0, 24);
    return (
      <div className="flex h-[720px] w-[390px] flex-col">
        <div className="flex flex-wrap gap-2">
          <Button text="Show all rows" onClick={() => setFilter("all")} />
          <Button
            text="Select first trace"
            onClick={() => setSelectedTraceId("trace-1")}
          />
          <Button
            text="Select later trace"
            onClick={() => setSelectedTraceId("trace-24")}
          />
          <Button
            text="Exclude selected trace"
            onClick={() => setFilter("first")}
          />
        </div>
        <TopicMobileTraceList
          {...args}
          rows={visible}
          filterKey={filter}
          selectedTraceId={selectedTraceId}
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Show all rows" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Open trace trace-24" }),
    ).toHaveAttribute("aria-current", "true");
    await userEvent.click(
      canvas.getByRole("button", { name: "Go to next page" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Open trace trace-40" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Select first trace" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Open trace trace-1" }),
    ).toHaveAttribute("aria-current", "true");
    const pagination = within(
      canvas.getByRole("navigation", { name: "Trace pagination" }),
    );
    await userEvent.click(pagination.getByRole("combobox"));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("option", {
        name: "10",
      }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Select later trace" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Open trace trace-24" }),
    ).toHaveAttribute("aria-current", "true");
    await expect(
      pagination.getByRole("spinbutton", { name: "Page number" }),
    ).toHaveValue(3);
    await userEvent.click(
      canvas.getByRole("button", { name: "Exclude selected trace" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Open trace trace-0" }),
    ).toBeVisible();
    await expect(pagination.getByRole("combobox")).toHaveTextContent("10");
  },
});
