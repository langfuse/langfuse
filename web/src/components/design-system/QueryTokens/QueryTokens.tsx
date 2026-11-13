import { type ReactNode } from "react";
import { ChevronDown } from "@langfuse/icons";
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
  // Compact parts share the query preview; empty titles suppress native tooltips.
  return groups.map((group, index) => (
    <span
      key={index}
      className={cn(
        compact ? "inline-flex min-w-0 items-center whitespace-pre" : undefined,
        !compact && group.noWrap && "whitespace-nowrap",
      )}
    >
      {group.parts.map((part, partIndex) => (
        <span
          key={partIndex}
          data-part={part.tone}
          title={compact ? "" : undefined}
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
  tokenEditor,
  helpId,
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
    /** An interactive value collection over complete source, with optional compaction. */
    collection?: {
      /** Absolute source range for the non-editable value collection only. */
      atom: { from: number; to: number; raw: string };
      /** Field prefix, value preview, then any trailing target groups. */
      groups: readonly TokenGroup[];
      label: string;
      previewLabel: string;
      values: readonly string[];
      compact: boolean;
    };
  }[];
  highlightedTokenId?: string | null;
  onActivateToken?: (id: string, anchor: HTMLButtonElement) => void;
  tokenEditor?: { from: number; popupId: string };
  helpId?: string;
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
    const collection =
      onActivateToken === undefined ? undefined : token.collection;
    if (token.from > cursor)
      content.push(
        ...plainText(value.slice(cursor, token.from), `gap:${cursor}`),
      );
    let tokenContent: ReactNode = token.raw;
    if (collection !== undefined) {
      tokenContent = (
        <>
          {renderGroups(collection.groups.slice(0, 1), false)}
          <span
            data-query-source={collection.atom.raw}
            contentEditable={false}
            className={cn(
              collection.compact
                ? "ml-1 inline-flex h-6 max-w-full items-center align-bottom"
                : "inline",
            )}
          >
            <button
              type="button"
              data-query-collection
              disabled={token.error !== null}
              aria-label={`Edit ${collection.label}${token.inactiveReason === null ? "" : `. Not applied on this view: ${token.inactiveReason}`}`}
              aria-haspopup="dialog"
              aria-expanded={tokenEditor?.from === token.from}
              aria-controls={
                tokenEditor?.from === token.from
                  ? tokenEditor.popupId
                  : undefined
              }
              aria-describedby={helpId}
              onClick={(event) =>
                onActivateToken?.(token.id, event.currentTarget)
              }
              className={cn(
                "focus-visible:ring-ring max-w-full cursor-pointer text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
                collection.compact
                  ? "border-border-contrast bg-secondary hover:border-foreground/40 hover:bg-accent aria-expanded:border-foreground/40 aria-expanded:bg-accent inline-flex h-5.5 min-w-0 items-center gap-1 rounded-md border px-1.5"
                  : "text-qlang-value hover:bg-accent aria-expanded:bg-accent inline rounded-sm align-baseline wrap-anywhere whitespace-pre-wrap",
              )}
            >
              {collection.compact ? (
                <>
                  {renderGroups(collection.groups.slice(1, 2), true)}
                  <span className="bg-background/70 text-muted-foreground shrink-0 rounded-sm px-1 font-sans text-[10px] leading-4">
                    +{collection.values.length - 1}
                  </span>
                  <ChevronDown
                    size="sm"
                    __rawClassName="text-muted-foreground shrink-0"
                    aria-hidden
                  />
                </>
              ) : (
                collection.atom.raw
              )}
            </button>
          </span>
          {renderGroups(collection.groups.slice(2), false)}
        </>
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
        data-deactivated={token.inactiveReason !== null || undefined}
        className={cn(
          "ph-no-capture max-w-full",
          collection === undefined
            ? tokenStyles[token.kind]
            : "inline rounded-sm border border-transparent px-1.5 py-0.5",
          collection !== undefined &&
            token.kind === "invalid" &&
            "border-destructive/70 bg-destructive/10 text-destructive border-dashed",
          token.inactiveReason !== null &&
            "line-through decoration-1 opacity-50",
          collection === undefined &&
            token.id === highlightedTokenId &&
            "border-ring",
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
