import { createContext, useContext, useState, type ReactNode } from "react";

type DatasetVersionContextType = {
  selectedVersion: Date | null;
  setSelectedVersion: (version: Date | null) => void;
  resetToLatest: () => void;
};

const DatasetVersionContext = createContext<
  DatasetVersionContextType | undefined
>(undefined);

export function DatasetVersionProvider({ children }: { children: ReactNode }) {
  const [selectedVersion, setSelectedVersion] = useState<Date | null>(null);

  const resetToLatest = () => setSelectedVersion(null);

  return (
    <DatasetVersionContext.Provider
      value={{ selectedVersion, setSelectedVersion, resetToLatest }}
    >
      {children}
    </DatasetVersionContext.Provider>
  );
}

export function useDatasetVersion() {
  const context = useContext(DatasetVersionContext);
  if (!context) {
    throw new Error(
      "useDatasetVersion must be used within DatasetVersionProvider",
    );
  }
  return context;
}
