import { getEventsTableStatePolicy } from "@/src/features/events/lib/eventsTableStatePolicy";

describe("getEventsTableStatePolicy", () => {
  it("isolates embedded table filters, search, and saved views", () => {
    expect(
      getEventsTableStatePolicy({
        hideControls: false,
        isolateTableState: true,
      }),
    ).toEqual({
      filterStateLocation: "memory",
      useIsolatedSearch: true,
      allowGrammarSearch: false,
      disableSavedViews: true,
    });
  });

  it("keeps the standard events table URL-backed", () => {
    expect(
      getEventsTableStatePolicy({
        hideControls: false,
        isolateTableState: false,
      }),
    ).toEqual({
      filterStateLocation: "urlAndSessionStorage",
      useIsolatedSearch: false,
      allowGrammarSearch: true,
      disableSavedViews: false,
    });
  });

  it("keeps hidden-control tables in memory without changing their search policy", () => {
    expect(
      getEventsTableStatePolicy({
        hideControls: true,
        isolateTableState: false,
      }),
    ).toEqual({
      filterStateLocation: "memory",
      useIsolatedSearch: false,
      allowGrammarSearch: true,
      disableSavedViews: true,
    });
  });
});
