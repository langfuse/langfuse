import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type PromptAiReviewContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
  feedbackContext: string;
  setFeedbackContext: (context: string) => void;
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [feedbackContext, setFeedbackContext] = useState("spelling");

  const addMessage = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  const clearMessages = () => {
    setMessages([]);
  };

  return (
    <PromptAiReviewContext.Provider
      value={{
        open,
        setOpen,
        messages,
        addMessage,
        clearMessages,
        feedbackContext,
        setFeedbackContext,
      }}
    >
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
