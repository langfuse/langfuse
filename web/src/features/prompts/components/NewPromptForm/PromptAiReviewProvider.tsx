import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";

type PromptAiReviewContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const PromptAiReviewContext = createContext<PromptAiReviewContextType | null>(
  null,
);

export interface PromptAiReviewProviderProps extends PropsWithChildren {
  defaultOpen?: boolean;
}

export function PromptAiReviewProvider({
  children,
  defaultOpen = false,
}: PromptAiReviewProviderProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <PromptAiReviewContext.Provider value={{ open, setOpen }}>
      {children}
    </PromptAiReviewContext.Provider>
  );
}

export function usePromptAiReview() {
  const ctx = useContext(PromptAiReviewContext);
  if (!ctx)
    throw new Error(
      "usePromptAiReview must be used within PromptAiReviewProvider",
    );
  return ctx;
}
