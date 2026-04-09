import { useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "@/src/utils/clipboard";

/**
 * Copies text to the clipboard and exposes a temporary success state for UI feedback.
 */
export function useCopyToClipboard({
  successDuration = 1_000,
}: {
  successDuration?: number;
} = {}) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const copy = async (text: string) => {
    setIsCopied(true);
    await copyTextToClipboard(text);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setIsCopied(false);
    }, successDuration);
  };

  return { copy, isCopied };
}
