import { useRef, useCallback } from "react";

// Create a class to hold the store
class PeekRowStore<T = any> {
  private rowData: Record<string, T> = {};

  setRow(id: string, data: T): void {
    this.rowData[id] = data;
  }

  getRow(id: string): T | undefined {
    return this.rowData[id];
  }

  clearRow(id: string): void {
    delete this.rowData[id];
  }

  clearAll(): void {
    this.rowData = {};
  }
}

// Create a single instance of the store
const globalPeekStore = new PeekRowStore();

// Create a hook to access the store from any component
export function usePeekStorage<T = any>() {
  // Create a ref that points to the global store
  const storeRef = useRef(globalPeekStore);

  // Create typed wrapper functions
  const setRow = useCallback((id: string, data: T) => {
    storeRef.current.setRow(id, data);
  }, []);

  const getRow = useCallback((id: string) => {
    return storeRef.current.getRow(id) as T | undefined;
  }, []);

  const clearRow = useCallback((id: string) => {
    storeRef.current.clearRow(id);
  }, []);

  const clearAll = useCallback(() => {
    storeRef.current.clearAll();
  }, []);

  return { setRow, getRow, clearRow, clearAll };
}
