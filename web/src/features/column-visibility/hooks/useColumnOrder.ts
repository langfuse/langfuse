import { useEffect } from "react";
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
  const [columnOrder, setColumnOrder] = useLocalStorage<string[]>(
    localStorageKey,
    [],
  );

  useEffect(() => {
    const appColumnIds = columns.map((c) => c.accessorKey);
    const storedColumnIds = readStoredColumnOrder(localStorageKey);

    const finalColumnOrder: string[] = storedColumnIds.filter((id) =>
      appColumnIds.includes(id),
    );

    appColumnIds.forEach((id) => {
      if (!finalColumnOrder.includes(id)) {
        finalColumnOrder.splice(appColumnIds.indexOf(id), 0, id);
      }
    });

    // Compare the new order with the current order to avoid unnecessary updates
    if (JSON.stringify(finalColumnOrder) !== JSON.stringify(columnOrder)) {
      setColumnOrder(finalColumnOrder);
    }
  }, [columns, localStorageKey, columnOrder, setColumnOrder]);

  return [columnOrder, setColumnOrder] as const;
}

export default useColumnOrder;
