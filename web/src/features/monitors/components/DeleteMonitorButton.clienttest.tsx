import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { DeleteMonitorButton } from "./DeleteMonitorButton";

describe("DeleteMonitorButton", () => {
  it("confirms before deleting an alert", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <DeleteMonitorButton
        monitorName="Evaluator cost alert"
        deleting={false}
        onDelete={onDelete}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Delete alert" });
    expect(trigger.querySelector(".text-destructive")).toBeInTheDocument();

    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Delete alert" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/permanently deletes "Evaluator cost alert"/),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete alert" }),
    );

    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
  });
});
