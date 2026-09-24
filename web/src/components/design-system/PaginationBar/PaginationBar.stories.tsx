import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { PaginationBar } from "./PaginationBar";

function PaginationBarStory() {
  const [state, setState] = useState({ pageIndex: 0, pageSize: 20 });

  return <PaginationBar totalCount={45} state={state} onChange={setState} />;
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
