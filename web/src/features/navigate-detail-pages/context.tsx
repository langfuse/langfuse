import React, {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export const detailPageListKeys = {
  traces: "traces",
  observations: "observations",
  events: "events",
  sessions: "sessions",
  evalTemplates: "eval-templates",
} as const;

export type DetailPageListKey =
  (typeof detailPageListKeys)[keyof typeof detailPageListKeys];

export type ListEntry<
  TParams extends Partial<Record<string, string>> = Record<string, string>,
> = {
  id: string;
  params?: TParams;
};

export type TraceDetailPageListEntry = ListEntry<{
  timestamp?: string;
}>;

export type ObservationDetailPageListEntry = ListEntry<{
  traceId: string;
  timestamp?: string;
  startTime?: string;
}>;

export type EventDetailPageListEntry = ObservationDetailPageListEntry;

interface ListContextType {
  detailPagelists: Record<string, Array<ListEntry>>;
  setDetailPageList: <TEntry extends ListEntry>(
    key: string,
    list: Array<TEntry>,
  ) => void;
}

const DetailPageLists = createContext<ListContextType | undefined>(undefined);

export function useDetailPageLists(): ListContextType {
  const context = useContext(DetailPageLists);
  if (!context) {
    throw new Error(
      "useDetailPageLists must be used within a DetailPageListsProvider",
    );
  }
  return context;
}

export function useFirstDetailPageListEntry<
  TEntry extends ListEntry = ListEntry,
>(key: string | undefined): TEntry | undefined {
  const { detailPagelists } = useDetailPageLists();
  if (!key) return undefined;
  return detailPagelists[key]?.[0] as TEntry | undefined;
}

export function DetailPageListsProvider(props: PropsWithChildren) {
  const [detailPagelists, setLists] = useState<
    Record<string, Array<ListEntry>>
  >({});

  const setDetailPageList = useCallback<ListContextType["setDetailPageList"]>(
    (key, list) => {
      setLists((prevLists) => ({ ...prevLists, [key]: list }));
    },
    [],
  );

  const contextValue = useMemo(
    () => ({ detailPagelists, setDetailPageList }),
    [detailPagelists, setDetailPageList],
  );

  return (
    <DetailPageLists.Provider value={contextValue}>
      {props.children}
    </DetailPageLists.Provider>
  );
}
