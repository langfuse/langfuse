import { create } from "zustand";

// Define the store type
interface PeekStore {
  // Store rows by table type and id
  rows: Record<string, any>;

  // Actions
  setRow: <T>(tableType: string, data: T) => void;
  getRow: <T>(tableType: string) => T | undefined;
  clearRow: (tableType: string) => void;
  clearAll: () => void;
}

// Create the store
export const usePeekStore = create<PeekStore>((set, get) => ({
  rows: {},

  setRow: (tableType, data) =>
    set((state) => ({
      rows: {
        ...state.rows,
        [tableType]: data,
      },
    })),

  getRow: (tableType) => get().rows[tableType],

  clearRow: (tableType) =>
    set((state) => {
      const newRows = { ...state.rows };
      delete newRows[tableType];
      return { rows: newRows };
    }),

  clearAll: () => set({ rows: {} }),
}));
