import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { PaginationBar } from "./PaginationBar";

function PaginationBarStory() {
  const [state, setState] = useState({ pageIndex: 0, pageSize: 20 });

  return (
    <PaginationBar
      mode="offset"
      totalCount={45}
      state={state}
      onChange={setState}
    />
  );
}

function CursorPaginationStory() {
  const [state, setState] = useState({ pageIndex: 0, pageSize: 50 });

  return (
    <PaginationBar
      mode="cursor"
      state={state}
      onChange={setState}
      hasNextPage={state.pageIndex === 0}
    />
  );
}

const meta = preview.meta({
  component: PaginationBarStory,
  parameters: {
    layout: "fullscreen",
  },
});

export const Default = meta.story({
  name: "(Test) Navigates pages",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("spinbutton", { name: "Page number" }),
    ).toHaveValue(1);
    await expect(canvas.getByText("of 3")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Go to next page" }),
    );
    await expect(
      canvas.getByRole("spinbutton", { name: "Page number" }),
    ).toHaveValue(2);
  },
});

export const Cursor = meta.story({
  name: "(Test) Navigates cursor pages",
  render: () => <CursorPaginationStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("1")).toBeVisible();
    await expect(canvas.queryByRole("spinbutton")).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Go to next page" }),
    );
    await expect(canvas.getByText("2")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Go to next page" }),
    ).toBeDisabled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Go to previous page" }),
    );
    await expect(canvas.getByText("1")).toBeVisible();
  },
});
