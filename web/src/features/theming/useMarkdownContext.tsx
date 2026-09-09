import useLocalStorage from "@/src/components/useLocalStorage";
import React, {
  type PropsWithChildren,
  createContext,
  useContext,
} from "react";

interface MarkdownContextType {
  isMarkdownEnabled: boolean;
  setIsMarkdownEnabled: (value: boolean) => void;
}

const MarkdownContext = createContext<MarkdownContextType | undefined>(
  undefined,
);

export const useMarkdownContext = (): MarkdownContextType => {
  const context = useContext(MarkdownContext);
  if (!context) {
    throw new Error(
      "useMarkdownContext must be used within a MarkdownContextProvider",
    );
  }
  return context;
};

export const MarkdownContextProvider = (props: PropsWithChildren) => {
  const [isMarkdownEnabled, setIsMarkdownEnabled] = useLocalStorage(
    "shouldRenderMarkdown",
    true,
  );

  return (
    <MarkdownContext.Provider
      value={{ isMarkdownEnabled, setIsMarkdownEnabled }}
    >
      {props.children}
    </MarkdownContext.Provider>
  );
};
