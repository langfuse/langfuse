// @vitest-environment node

import { getEventsTableStatePolicy } from "@/src/features/events/lib/eventsTableStatePolicy";

describe("getEventsTableStatePolicy", () => {
  it("isolates embedded table filters, search, and saved views", () => {
    expect(
      getEventsTableStatePolicy({
        hideControls: false,
        isolateTableState: true,
        hasParentScope: true,
      }),
    ).toEqual({
      filterStateLocation: "memory",
      useIsolatedSearch: true,
      disableSavedViews: true,
      useHostSearchScopes: true,
    });
  });

  it("keeps the standard events table URL-backed", () => {
    expect(
      getEventsTableStatePolicy({
        hideControls: false,
        isolateTableState: false,
        hasParentScope: false,
      }),
    ).toEqual({
      filterStateLocation: "urlAndSessionStorage",
      useIsolatedSearch: false,
      disableSavedViews: false,
      useHostSearchScopes: false,
    });
  });

  it("keeps hidden-control tables in memory without changing their search policy", () => {
    expect(
      getEventsTableStatePolicy({
        hideControls: true,
        isolateTableState: false,
        hasParentScope: false,
      }),
    ).toEqual({
      filterStateLocation: "memory",
      useIsolatedSearch: false,
      disableSavedViews: true,
      useHostSearchScopes: false,
    });
  });

  it("preserves parent-page search scopes without changing URL-backed filters", () => {
    expect(
      getEventsTableStatePolicy({
        hideControls: false,
        isolateTableState: false,
        hasParentScope: true,
      }),
    ).toEqual({
      filterStateLocation: "urlAndSessionStorage",
      useIsolatedSearch: false,
      disableSavedViews: false,
      useHostSearchScopes: true,
    });
  });
});
