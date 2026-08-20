import { useEffect, useRef, useState } from "react";
import {
  copyRichTextToClipboard,
  copyTextToClipboard,
} from "@/src/utils/clipboard";

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

  const runCopy = async (copyToClipboard: () => Promise<void> | void) => {
    setIsCopied(true);
    try {
      await copyToClipboard();
    } finally {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setIsCopied(false);
      }, successDuration);
    }
  };

  const copy = async (text: string) => runCopy(() => copyTextToClipboard(text));

  const copyRich = async (content: { text: string; html: string }) =>
    runCopy(() => copyRichTextToClipboard(content));

  return { copy, copyRich, isCopied };
}
