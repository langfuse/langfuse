import { create } from "zustand";

interface BoardState {
  searchString: string;
  setSearchString: (searchString: string) => void;
  authors: HashTag[];
  setAuthors: (authors: HashTag[]) => void;
  sources: HashTag[];
  setSources: (sources: HashTag[]) => void;
  countries: HashTag[];
  setCountries: (countries: HashTag[]) => void;
  languages: HashTag[];
  setLanguages: (languages: HashTag[]) => void;
}

export const useKnowledgeStore = create<BoardState>((set, get) => ({
  searchString: "",
  setSearchString: (searchString: string) => set({ searchString }),
  authors: [],
  setAuthors: (authors: HashTag[]) => set({ authors }),
  sources: [],
  setSources: (sources: HashTag[]) => set({ sources }),
  countries: [],
  setCountries: (countries: HashTag[]) => set({ countries }),
  languages: [],
  setLanguages: (languages: HashTag[]) => set({ languages }),
}));
