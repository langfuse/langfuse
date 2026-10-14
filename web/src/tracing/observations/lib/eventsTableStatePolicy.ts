export type EventsTableStatePolicy = {
  filterStateLocation: "memory" | "urlAndSessionStorage";
  useIsolatedSearch: boolean;
  disableSavedViews: boolean;
  useHostSearchScopes: boolean;
};

export const getEventsTableStatePolicy = ({
  hideControls,
  isolateTableState,
  hasParentScope,
}: {
  hideControls: boolean;
  isolateTableState: boolean;
  hasParentScope: boolean;
}): EventsTableStatePolicy => ({
  filterStateLocation:
    hideControls || isolateTableState ? "memory" : "urlAndSessionStorage",
  useIsolatedSearch: isolateTableState,
  disableSavedViews: hideControls || isolateTableState,
  useHostSearchScopes: isolateTableState || hasParentScope,
});
