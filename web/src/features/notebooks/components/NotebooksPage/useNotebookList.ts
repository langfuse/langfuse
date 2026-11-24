import { useState } from "react";

import { api } from "@/src/utils/api";

export function useNotebookList(projectId: string) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const notebooks = api.notebooks.list.useQuery(
    { projectId, search: search || undefined, cursor: cursors.at(-1) },
    { meta: { silentAllErrors: true } },
  );
  const nextCursor = notebooks.data?.nextCursor;

  function applySearch(value: string) {
    const nextSearch = value.trim().slice(0, 250);
    if (nextSearch === search) return;
    setSearch(nextSearch);
    setCursors([]);
  }

  return {
    notebooks,
    hasSearch: search !== "",
    searchInputProps: {
      value: searchInput,
      onChange: (value: string) => {
        setSearchInput(value.slice(0, 250));
        if (value === "") applySearch(value);
      },
      onSubmit: applySearch,
    },
    pagination: {
      pageIndex: cursors.length,
      hasNextPage: Boolean(nextCursor),
      previousPage: () => setCursors(cursors.slice(0, -1)),
      onChange: ({ pageIndex }: { pageIndex: number }) => {
        if (pageIndex < cursors.length) {
          setCursors(cursors.slice(0, pageIndex));
        } else if (nextCursor) {
          setCursors([...cursors, nextCursor]);
        }
      },
    },
  };
}
