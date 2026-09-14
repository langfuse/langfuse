import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { invalidateMonitorQueriesAfterDelete } from "@/src/features/monitors/fns/invalidateMonitorQueriesAfterDelete";
import { DeleteMonitorButton } from "./DeleteMonitorButton";

describe("DeleteMonitorButton", () => {
  it("invalidates monitor lists without refetching the deleted monitor", async () => {
    const monitors = {
      all: { invalidate: vi.fn().mockResolvedValue(undefined) },
      getFilterOptions: { invalidate: vi.fn().mockResolvedValue(undefined) },
      linkedEvaluatorAlerts: {
        invalidate: vi.fn().mockResolvedValue(undefined),
      },
      get: { invalidate: vi.fn().mockResolvedValue(undefined) },
      invalidate: vi.fn().mockResolvedValue(undefined),
    };

    await invalidateMonitorQueriesAfterDelete(monitors);

    expect(monitors.all.invalidate).toHaveBeenCalledOnce();
    expect(monitors.getFilterOptions.invalidate).toHaveBeenCalledOnce();
    expect(monitors.linkedEvaluatorAlerts.invalidate).toHaveBeenCalledOnce();
    expect(monitors.get.invalidate).not.toHaveBeenCalled();
    expect(monitors.invalidate).not.toHaveBeenCalled();
  });

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
