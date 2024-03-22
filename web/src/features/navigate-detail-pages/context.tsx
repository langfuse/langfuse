import React, {
  type PropsWithChildren,
  createContext,
  useContext,
  useState,
} from "react";

interface ListContextType {
  detailPagelists: Record<string, Array<string>>;
  setDetailPageList: (key: string, list: Array<string>) => void;
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
  const [detailPagelists, setLists] = useState<Record<string, Array<string>>>(
    {},
  );

  const setDetailPageList = (key: string, list: Array<string>) => {
    setLists((prevLists) => ({ ...prevLists, [key]: list }));
  };

  return (
    <DetailPageLists.Provider value={{ detailPagelists, setDetailPageList }}>
      {props.children}
    </DetailPageLists.Provider>
  );
}
