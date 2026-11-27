import { useEffect, useRef, useState } from "react";
import {
  copyRichTextToClipboard,
  copyTextToClipboard,
} from "@/src/utils/clipboard";

type CopyStatus =
  | { kind: "idle" }
  | { kind: "copied"; consecutiveSuccesses: number }
  | { kind: "failed" };

/** Copies text to the clipboard and tracks the outcome for UI feedback. */
export function useCopyToClipboard({
  successDuration = 1_000,
}: {
  successDuration?: number;
} = {}) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>({ kind: "idle" });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const runCopy = async (copyToClipboard: () => Promise<void> | void) => {
    try {
      await copyToClipboard();
    } catch (error) {
      setCopyStatus({ kind: "failed" });
      throw error;
    } finally {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    setCopyStatus((previous) => ({
      kind: "copied",
      consecutiveSuccesses:
        previous.kind === "copied" ? previous.consecutiveSuccesses + 1 : 1,
    }));
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setCopyStatus({ kind: "idle" });
    }, successDuration);
  };

  const copy = async (text: string) => runCopy(() => copyTextToClipboard(text));

  const copyRich = async (content: { text: string; html: string }) =>
    runCopy(() => copyRichTextToClipboard(content));

  return { copy, copyRich, copyStatus, isCopied: copyStatus.kind === "copied" };
}
