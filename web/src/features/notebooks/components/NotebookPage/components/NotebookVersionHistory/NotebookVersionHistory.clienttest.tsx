import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { NotebookVersionHistory } from "./NotebookVersionHistory";

it("keeps history open when switching versions and restores focus on close", async () => {
  const onVersionChange = vi.fn();
  const view = {
    isDraft: false,
    notebookDirty: true,
    version: 1,
    versions: [{ number: 1, publishedAt: new Date("2026-11-24T12:00:00Z") }],
  };
  const { rerender } = render(
    <NotebookVersionHistory view={view} onVersionChange={onVersionChange} />,
  );

  const trigger = screen.getByRole("button", { name: "Version history" });
  fireEvent.click(trigger);
  const drawer = await screen.findByRole("dialog", { name: "Version history" });
  const draft = within(drawer).getByRole("button", { name: "Draft" });
  fireEvent.click(draft);
  expect(onVersionChange).toHaveBeenCalledWith(null);
  rerender(
    <NotebookVersionHistory
      view={{ ...view, isDraft: true, version: null }}
      onVersionChange={onVersionChange}
    />,
  );
  expect(draft).toHaveAttribute("aria-current", "true");

  fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});
