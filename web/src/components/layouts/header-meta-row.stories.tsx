import { type ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { HeaderMetaRow } from "@/src/components/layouts/header-meta-row";
import {
  HeaderPill,
  HeaderPillDot,
  HeaderPillValue,
} from "@/src/components/layouts/header-pill";

const defaultItems = [
  {
    key: "traces",
    searchText: "traces 3 spans 90",
    content: (
      <HeaderPill variant="display">
        <span>
          <HeaderPillValue>3</HeaderPillValue> traces
        </span>
        <HeaderPillDot />
        <span>
          <HeaderPillValue>90</HeaderPillValue> spans
        </span>
      </HeaderPill>
    ),
  },
  {
    key: "latency",
    searchText: "latency p50 p95",
    content: (
      <HeaderPill variant="display">
        <span>
          p50 <HeaderPillValue>1m 43s</HeaderPillValue>
        </span>
        <HeaderPillDot />
        <span>
          p95 <HeaderPillValue>5m 49s</HeaderPillValue>
        </span>
      </HeaderPill>
    ),
  },
  {
    key: "tokens",
    searchText: "tokens 3742851 23281 3766132",
    content: (
      <HeaderPill
        variant="display"
        title="tokens 3,742,851 → 23,281 (Σ 3,766,132)"
      >
        <span>
          tokens <HeaderPillValue>3.7m → 23k (Σ 3.8m)</HeaderPillValue>
        </span>
      </HeaderPill>
    ),
  },
  {
    key: "cost",
    searchText: "cost 3.841",
    content: (
      <HeaderPill variant="display">
        cost <HeaderPillValue>$3.841</HeaderPillValue>
      </HeaderPill>
    ),
  },
  {
    key: "environment",
    searchText: "environment env default",
    content: (
      <HeaderPill variant="display">
        env <HeaderPillValue>default</HeaderPillValue>
      </HeaderPill>
    ),
  },
] satisfies ComponentProps<typeof HeaderMetaRow>["items"];

const overflowItems = [
  ...defaultItems,
  ...Array.from({ length: 16 }, (_, index) => ({
    key: `score-${index + 1}`,
    searchText: `score quality ${index + 1}`,
    content: (
      <HeaderPill variant="display" title={`Quality ${index + 1}`}>
        <span className="max-w-40 truncate">Quality {index + 1}</span>
        <HeaderPillValue>{((index + 1) / 20).toFixed(2)}</HeaderPillValue>
      </HeaderPill>
    ),
  })),
] satisfies ComponentProps<typeof HeaderMetaRow>["items"];

const meta = preview.meta({
  component: HeaderMetaRow,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
});

export default meta;

export const Default = meta.story({
  args: {
    items: defaultItems,
    noun: "trace details",
  },
});

export const Overflow = meta.story({
  args: {
    items: overflowItems,
    noun: "trace details",
  },
});

export const TestSearchesHiddenPills = meta.story({
  name: "(Test) Searches hidden pills",
  args: {
    items: overflowItems,
    noun: "trace details",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvas.getByRole("button", {
          name: /show \d+ hidden trace details/i,
        }),
      ).toBeInTheDocument(),
    );
    const overflowButton = canvas.getByRole("button", {
      name: /show \d+ hidden trace details/i,
    });
    await userEvent.click(overflowButton);

    const body = within(canvasElement.ownerDocument.body);
    const searchInput = await body.findByRole("textbox", {
      name: "Search trace details",
    });
    const dialog = body.getByRole("dialog");
    await expect(within(dialog).queryByText(/traces/i)).not.toBeInTheDocument();

    await userEvent.type(searchInput, "quality 16");
    await expect(within(dialog).getByText("Quality 16")).toBeInTheDocument();
    await expect(
      within(dialog).queryByText("Quality 1"),
    ).not.toBeInTheDocument();
  },
});
