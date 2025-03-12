import { createContext, useContext, useState, type ReactNode } from "react";

interface GlobalOverflowSuppressorContextType {
  suppress: boolean;
  setSuppress: (suppress: boolean) => void;
}

const GlobalOverflowSuppressorContext = createContext<
  GlobalOverflowSuppressorContextType | undefined
>(undefined);

export function GlobalOverflowSuppressorProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [suppress, setSuppress] = useState(false);

  return (
    <GlobalOverflowSuppressorContext.Provider value={{ suppress, setSuppress }}>
      {children}
    </GlobalOverflowSuppressorContext.Provider>
  );
}

export function useGlobalOverflowSuppressor() {
  const context = useContext(GlobalOverflowSuppressorContext);
  if (context === undefined) {
    throw new Error(
      "useGlobalOverflowSuppressor must be used within a GlobalOverflowSuppressorProvider",
    );
  }
  return context;
}
