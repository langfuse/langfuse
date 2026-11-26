import { type PropsWithChildren } from "react";
import {
  DetailPageLists,
  useDetailPageLists,
  type ListEntry,
} from "./DetailPageListsProvider";

export function DetailPageListsOverride({
  overrides,
  children,
}: PropsWithChildren<{ overrides: Record<string, ListEntry[]> }>) {
  const { detailPagelists, setDetailPageList } = useDetailPageLists();
  return (
    <DetailPageLists.Provider
      value={{
        detailPagelists: { ...detailPagelists, ...overrides },
        setDetailPageList,
      }}
    >
      {children}
    </DetailPageLists.Provider>
  );
}
