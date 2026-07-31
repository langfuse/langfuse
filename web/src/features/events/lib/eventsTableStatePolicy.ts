export type EventsTableStatePolicy = {
  filterStateLocation: "memory" | "urlAndSessionStorage";
  useIsolatedSearch: boolean;
  allowGrammarSearch: boolean;
  disableSavedViews: boolean;
};

export const getEventsTableStatePolicy = ({
  hideControls,
  isolateTableState,
}: {
  hideControls: boolean;
  isolateTableState: boolean;
}): EventsTableStatePolicy => ({
  filterStateLocation:
    hideControls || isolateTableState ? "memory" : "urlAndSessionStorage",
  useIsolatedSearch: isolateTableState,
  allowGrammarSearch: !isolateTableState,
  disableSavedViews: hideControls || isolateTableState,
});
