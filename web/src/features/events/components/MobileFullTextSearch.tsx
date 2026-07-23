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
  const [draft, setDraft] = useState(currentQuery ?? "");

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
        className="w-full min-w-0 border-none bg-transparent px-0 text-sm focus-visible:ring-0 focus-visible:outline-hidden"
      />
    </div>
  );
}
