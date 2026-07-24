"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/**
 * Full-text search input for the mobile Filters sheet, used when the grammar
 * search bar is unavailable — i.e. `searchBarMode` is off, which is the case
 * for userId/sessionId-scoped events tables (the embedded "events for this
 * user/session" tabs). On desktop those tables keep full-text search via the
 * toolbar's `searchConfig`; the toolbar is collapsed away on mobile, so without
 * this the search would be unreachable there (LFE-11067).
 *
 * Mirrors the toolbar's search input: submit on Enter (or the icon), clear
 * immediately when emptied. It uses the table's CURRENT search type — the
 * type selector stays a desktop-only refinement, not the core capability the
 * mobile surface needs restored. The draft is local; the sheet unmounts on
 * close, so reopening re-seeds it from the committed query.
 */
export function MobileFullTextSearch({
  currentQuery,
  updateQuery,
  tableAllowsFullTextSearch,
  metadataSearchFields,
}: {
  currentQuery?: string;
  updateQuery: (query: string) => void;
  tableAllowsFullTextSearch?: boolean;
  metadataSearchFields?: string[];
}) {
  const capture = usePostHogClientCapture();
  const committed = currentQuery ?? "";
  const [draft, setDraft] = useState(committed);
  // Re-seed the draft when the committed query changes underneath us — e.g. the
  // sheet's "Clear all" (which does NOT close the sheet, so this stays mounted)
  // empties the query while the input still holds typed text. React's
  // adjust-state-during-render pattern (not an effect): on the user's own
  // submit the committed value already equals the draft, so this is a no-op.
  const [lastCommitted, setLastCommitted] = useState(committed);
  if (committed !== lastCommitted) {
    setLastCommitted(committed);
    setDraft(committed);
  }

  const submit = (query: string) => {
    capture("table:search_submit");
    updateQuery(query);
  };

  return (
    <div className="border-input bg-background flex h-9 min-w-0 items-center rounded-md border pl-2">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search"
        className="mr-1 h-7 w-7 shrink-0"
        onClick={() => submit(draft)}
      >
        <Search className="h-4 w-4" />
      </Button>
      <Input
        placeholder={
          tableAllowsFullTextSearch
            ? "Search…"
            : `Search (${metadataSearchFields?.join(", ") ?? ""})`
        }
        value={draft}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft(next);
          // Match the toolbar: clearing the field applies immediately so the
          // list unfilters without needing an explicit submit.
          if (next === "") submit("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit(draft);
        }}
        // Commit on blur too, so tapping the sheet's "Show results" (or anywhere
        // outside the field) applies a typed-but-not-Entered query instead of
        // discarding it — matching the grammar bar's commit-on-blur. Guarded so
        // a focus/blur without changes (or right after an icon/Enter submit)
        // doesn't re-fire.
        onBlur={() => {
          if (draft !== committed) submit(draft);
        }}
        className="w-full min-w-0 border-none bg-transparent px-0 text-sm focus-visible:ring-0 focus-visible:outline-hidden"
      />
    </div>
  );
}
