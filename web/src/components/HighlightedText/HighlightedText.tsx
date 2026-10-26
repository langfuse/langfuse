import { useMemo, type ReactNode } from "react";
import { splitHighlightedText } from "./fns/splitHighlightedText";

export function HighlightedText({
  text,
  query,
  children,
}: {
  text: string;
  query: string;
  children: (parts: ReturnType<typeof splitHighlightedText>) => ReactNode;
}) {
  const parts = useMemo(() => splitHighlightedText(text, query), [text, query]);

  return children(parts);
}
