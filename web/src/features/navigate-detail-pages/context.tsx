import React, {
  type PropsWithChildren,
  createContext,
  useContext,
  useState,
} from "react";

export type ListEntry = {
  id: string;
  params?: Record<string, string>;
};

interface ListContextType {
  detailPagelists: Record<string, Array<ListEntry>>;
  setDetailPageList: (key: string, list: Array<ListEntry>) => void;
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

export function DetailPageListsProvider(props: PropsWithChildren) {
  const [detailPagelists, setLists] = useState<
    Record<string, Array<ListEntry>>
  >({});

  const setDetailPageList = (key: string, list: Array<ListEntry>) => {
    setLists((prevLists) => ({ ...prevLists, [key]: list }));
  };

  return (
    <DetailPageLists.Provider value={{ detailPagelists, setDetailPageList }}>
      {props.children}
    </DetailPageLists.Provider>
  );
}
