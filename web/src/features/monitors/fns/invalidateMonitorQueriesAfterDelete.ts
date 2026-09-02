type MonitorQueryInvalidations = {
  all: { invalidate: () => Promise<unknown> };
  getFilterOptions: { invalidate: () => Promise<unknown> };
  linkedEvaluatorAlerts: { invalidate: () => Promise<unknown> };
};

/** Refreshes monitor collections without refetching the deleted monitor detail. */
export async function invalidateMonitorQueriesAfterDelete(
  monitors: MonitorQueryInvalidations,
): Promise<void> {
  await Promise.all([
    monitors.all.invalidate(),
    monitors.getFilterOptions.invalidate(),
    monitors.linkedEvaluatorAlerts.invalidate(),
  ]);
}
