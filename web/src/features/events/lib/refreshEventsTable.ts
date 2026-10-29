type Invalidatable = { invalidate: () => Promise<unknown> };

export type EventsRefreshUtils = {
  events: {
    all: Invalidatable;
    countAll: Invalidatable;
    filterOptions: Invalidatable;
  };
  dashboard: { executeQuery: Invalidatable };
};

/**
 * Refreshes the events table: the row queries settle first, then the
 * auxiliary queries (count, facet options, chart/outlier strip) are
 * invalidated so they do not compete with the row refetch.
 */
export async function refreshEventsTable(utils: EventsRefreshUtils) {
  await utils.events.all.invalidate();
  await Promise.all([
    utils.events.countAll.invalidate(),
    // Invalidate filterOptions too so the "Total ≈ X" count refreshes.
    utils.events.filterOptions.invalidate(),
    utils.dashboard.executeQuery.invalidate(),
  ]);
}
