import { createStore } from "zustand/vanilla";
import type { SetStateAction } from "react";

export function createComposerStore() {
  return createStore<{
    input: string;
    setInput: (value: SetStateAction<string>) => void;
  }>((set) => ({
    input: "",
    setInput: (value) => {
      set((state) => ({
        input: typeof value === "function" ? value(state.input) : value,
      }));
    },
  }));
}
