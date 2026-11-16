import { type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import { WORD_JOINER, QUERY_LABEL_COLORS } from "./QueryTokens.constants";

const tokenStyles = {
  filter:
    "inline rounded-sm border border-transparent bg-secondary px-1.5 py-0.5 text-secondary-foreground transition-colors hover:border-border-contrast",
  freeText:
    "mr-1 inline rounded-sm border border-transparent bg-muted/70 px-1.5 py-0.5 text-foreground/90 transition-colors hover:border-border-contrast",
  operator: "font-bold uppercase text-qlang-keyword",
  paren: "text-muted-foreground",
  invalid:
    "mr-1 inline rounded border border-dashed border-destructive/70 bg-destructive/10 px-1.5 py-0.5 text-destructive transition-colors hover:border-destructive",
};
const partStyles = {
  field: "text-qlang-field",
  muted: "text-muted-foreground",
  value: "text-qlang-value",
  number: "text-qlang-number",
  target: "",
};

export function QueryTokens({
  value,
  tokens,
  highlightedTokenId,
}: {
  value: string;
  tokens: readonly {
    id: string;
    from: number;
    to: number;
    raw: string;
    editable: boolean;
    error: string | null;
    explanation: { subject: string; predicate: string } | null;
    inactiveReason: string | null;
    kind: "filter" | "freeText" | "operator" | "paren" | "invalid";
    groups?: readonly {
      noWrap: boolean;
      parts: readonly {
        text: string;
        tone: "field" | "muted" | "value" | "number" | "target";
        color?: keyof typeof QUERY_LABEL_COLORS;
      }[];
    }[];
  }[];
  highlightedTokenId?: string | null;
}) {
  const content: ReactNode[] = [];
  let cursor = 0;
  // IMEs mutate text nodes React may not rewrite when whitespace is unchanged.
  // Managed spans let compositionend remount those nodes reliably.
  const plainText = (text: string, key: string) =>
    text
      .split(/(\s+)/)
      .filter(Boolean)
      .map((part, index) => (
        <span key={`${key}:${index}`} className="ph-no-capture">
          {part}
        </span>
      ));
  for (const token of tokens) {
    if (token.from > cursor)
      content.push(
        ...plainText(value.slice(cursor, token.from), `gap:${cursor}`),
      );
    // Non-positioned, short inline boxes keep Chromium's caret visible and
    // prevent Safari from sizing the caret taller than the token text.
    content.push(
      <span
        key={token.id}
        data-testid="search-bar-token"
        data-kind={token.kind}
        data-segment-id={token.id}
        data-deactivated={token.inactiveReason !== null || undefined}
        className={cn(
          "ph-no-capture max-w-full",
          tokenStyles[token.kind],
          token.inactiveReason !== null &&
            "line-through decoration-1 opacity-50",
          token.id === highlightedTokenId && "border-ring",
        )}
      >
        {token.groups
          ? token.groups.map((group, index) => (
              <span
                key={index}
                className={group.noWrap ? "whitespace-nowrap" : undefined}
              >
                {group.parts.map((part, partIndex) => (
                  <span
                    key={partIndex}
                    data-part={part.tone}
                    className={cn(
                      partStyles[part.tone],
                      part.color && QUERY_LABEL_COLORS[part.color],
                    )}
                  >
                    {part.text}
                  </span>
                ))}
              </span>
            ))
          : token.raw}
        {/* Inside the pill, the joiner keeps Safari's trailing caret before its padding. */}
        {WORD_JOINER}
      </span>,
    );
    cursor = token.to;
  }
  if (cursor < value.length)
    content.push(...plainText(value.slice(cursor), `tail:${cursor}`));
  return content;
}
