import { type LangfuseColumnDef } from "@/src/components/table/types";
import useLocalStorage from "@/src/components/useLocalStorage";

// returns deep copy of local storage object
const readStoredColumnOrder = (localStorageKey: string): string[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const storedValue = localStorage.getItem(localStorageKey);
    return storedValue ? JSON.parse(storedValue) : [];
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

    // if new column has been added to table, insert it at it's default position
    if (columnIds.length > storedColumnOrder.length) {
      const newColumnOrder = [...storedColumnOrder];
      columnIds.forEach((id) => {
        if (!newColumnOrder.includes(id)) {
          const index = columnIds.indexOf(id);
          newColumnOrder.splice(index, 0, id);
        }
      });
      return newColumnOrder;
    }
    return storedColumnOrder;
  };

  const [columnOrder, setColumnOrder] = useLocalStorage<string[]>(
    localStorageKey,
    initialColumnOrder(),
  );

  return [columnOrder, setColumnOrder] as const;
}

export default useColumnOrder;
