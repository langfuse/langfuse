import { useMemo } from "react";
import {
  JSONView,
  IO_TABLE_CHAR_LIMIT,
} from "@/src/components/ui/CodeJsonViewer";

/**
 * `JSON.stringify(metadata)`, computed once and memoized on the `metadata`
 * reference. Score `metadata` is arbitrary user-supplied JSON with no
 * server-side size limit, so stringifying it inline on every render (as
 * callers used to) is wasted work for large blobs. Share this single
 * stringified value between a compact preview string and the
 * `ScoreMetadataJsonView` size gate below instead of stringifying twice.
 */
export function useStringifiedMetadata(metadata: unknown): string | undefined {
  return useMemo(() => {
    if (metadata === null || metadata === undefined) return undefined;
    try {
      return JSON.stringify(metadata);
    } catch {
      return undefined;
    }
  }, [metadata]);
}

/**
 * Score-metadata JSON tree for a hover-card/tooltip preview. Gated the same
 * way as `IOTableCell.tsx`'s cell content (`IO_TABLE_CHAR_LIMIT` chars):
 * above the limit, render a truncated JSON slice plus a note instead of
 * mounting the full, unbounded `JSONView` tree -- which otherwise freezes
 * the tab on hover for large metadata payloads, same failure mode already
 * fixed for trace IO table cells.
 */
export function ScoreMetadataJsonView({
  metadata,
  stringified,
  codeClassName,
}: {
  metadata: unknown;
  /** Pre-computed via `useStringifiedMetadata` -- reused here instead of
   *  re-stringifying `metadata`. */
  stringified: string | undefined;
  codeClassName?: string;
}) {
  const shouldTruncate =
    stringified !== undefined && stringified.length > IO_TABLE_CHAR_LIMIT;

  if (shouldTruncate) {
    return (
      <div className="flex flex-col gap-1">
        <JSONView
          codeClassName={codeClassName}
          json={`${stringified.slice(0, IO_TABLE_CHAR_LIMIT)}...[truncated ${
            stringified.length - IO_TABLE_CHAR_LIMIT
          } characters]`}
        />
        <div className="text-muted-foreground px-2 pb-1 text-xs">
          Metadata is too large to preview in full and was truncated.
        </div>
      </div>
    );
  }

  return <JSONView codeClassName={codeClassName} json={metadata} />;
}
