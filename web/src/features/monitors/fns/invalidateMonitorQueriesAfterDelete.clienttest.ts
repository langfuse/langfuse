import { describe, expect, it, vi } from "vitest";
import { invalidateMonitorQueriesAfterDelete } from "./invalidateMonitorQueriesAfterDelete";

describe("invalidateMonitorQueriesAfterDelete", () => {
  it("invalidates monitor lists without refetching the deleted monitor", async () => {
    const monitors = {
      all: { invalidate: vi.fn().mockResolvedValue(undefined) },
      getFilterOptions: { invalidate: vi.fn().mockResolvedValue(undefined) },
      linkedEvaluatorAlerts: {
        invalidate: vi.fn().mockResolvedValue(undefined),
      },
      get: { invalidate: vi.fn() },
      invalidate: vi.fn(),
    };

    await invalidateMonitorQueriesAfterDelete(monitors);

    expect(monitors.all.invalidate).toHaveBeenCalledOnce();
    expect(monitors.getFilterOptions.invalidate).toHaveBeenCalledOnce();
    expect(monitors.linkedEvaluatorAlerts.invalidate).toHaveBeenCalledOnce();
    expect(monitors.get.invalidate).not.toHaveBeenCalled();
    expect(monitors.invalidate).not.toHaveBeenCalled();
  });
});
