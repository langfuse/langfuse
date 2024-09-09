import { type LangfuseColumnDef } from "@/src/components/table/types";
import useLocalStorage from "@/src/components/useLocalStorage";
// returns deep copy of local storage object
const readStoredColumnOrder = (localStorageKey: string): string[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const storedValue = localStorage.getItem(localStorageKey);
    return storedValue ? JSON.parse(storedValue) : {};
  } catch (error) {
    console.error("Error reading from local storage", error);
    return [];
  }
};

function useColumnOrder<TData>(
  localStorageKey: string,
  columns: LangfuseColumnDef<TData>[],
) {
  const initialColumnOrder = () => {
    const storedColumnOrder = readStoredColumnOrder(localStorageKey);
    const columnIds = columns.map((c) => c.accessorKey);
    return columnIds.length === storedColumnOrder.length
      ? storedColumnOrder
      : columnIds;
  };

  const [columnOrder, setColumnOrder] = useLocalStorage<string[]>(
    localStorageKey,
    initialColumnOrder(),
  );

  return [columnOrder, setColumnOrder] as const;
}

export default useColumnOrder;
