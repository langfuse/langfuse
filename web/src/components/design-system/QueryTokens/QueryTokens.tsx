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

type TokenGroup = {
  noWrap: boolean;
  parts: readonly {
    text: string;
    tone: keyof typeof partStyles;
    color?: keyof typeof QUERY_LABEL_COLORS;
  }[];
};

function renderGroups(groups: readonly TokenGroup[], compact: boolean) {
  return groups.map((group, index) => (
    <span
      key={index}
      className={cn(
        compact ? "inline-flex min-w-0 items-center whitespace-pre" : undefined,
        compact && index === 0 && "max-w-[50%] shrink-0",
        !compact && group.noWrap && "whitespace-nowrap",
      )}
    >
      {group.parts.map((part, partIndex) => (
        <span
          key={partIndex}
          data-part={part.tone}
          title={compact ? part.text : undefined}
          className={cn(
            partStyles[part.tone],
            part.color && QUERY_LABEL_COLORS[part.color],
            compact &&
              (part.tone === "value" || part.tone === "number") &&
              "max-w-32 min-w-0 truncate",
            compact &&
              (part.tone === "field" || part.tone === "target") &&
              "max-w-40 min-w-0 truncate",
          )}
        >
          {part.text}
        </span>
      ))}
    </span>
  ));
}

export function QueryTokens({
  value,
  tokens,
  highlightedTokenId,
  onActivateToken,
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
    groups?: readonly TokenGroup[];
    /** A display projection; raw and offsets always describe the complete query. */
    summary?: {
      groups: readonly TokenGroup[];
      label: string;
      values: readonly string[];
    };
  }[];
  highlightedTokenId?: string | null;
  onActivateToken?: (id: string, anchor: HTMLButtonElement) => void;
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
    const summary = onActivateToken === undefined ? undefined : token.summary;
    if (token.from > cursor)
      content.push(
        ...plainText(value.slice(cursor, token.from), `gap:${cursor}`),
      );
    let tokenContent: ReactNode = token.raw;
    if (summary !== undefined) {
      tokenContent = (
        <button
          type="button"
          data-query-summary
          aria-label={`Edit ${summary.label}`}
          aria-haspopup="dialog"
          onClick={(event) => onActivateToken?.(token.id, event.currentTarget)}
          className="focus-visible:ring-ring inline-flex h-full max-w-full min-w-0 items-center rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          {renderGroups(summary.groups, true)}
        </button>
      );
    } else if (token.groups !== undefined) {
      tokenContent = renderGroups(token.groups, false);
    }
    // Non-positioned, short inline boxes keep Chromium's caret visible and
    // prevent Safari from sizing the caret taller than the token text.
    content.push(
      <span
        key={token.id}
        data-testid="search-bar-token"
        data-kind={token.kind}
        data-segment-id={token.id}
        data-query-source={summary === undefined ? undefined : token.raw}
        contentEditable={summary === undefined ? undefined : false}
        data-deactivated={token.inactiveReason !== null || undefined}
        className={cn(
          "ph-no-capture max-w-full",
          tokenStyles[token.kind],
          summary !== undefined &&
            "inline-flex h-6 items-center py-0 align-bottom",
          token.inactiveReason !== null &&
            "line-through decoration-1 opacity-50",
          token.id === highlightedTokenId && "border-ring",
        )}
      >
        {tokenContent}
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
