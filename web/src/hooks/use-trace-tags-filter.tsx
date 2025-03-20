"use client";

import { useState, useEffect } from "react";

export function convertSelectedTraceTagsToFilter(
  tagColumns: string[],
  selectedTags: string[],
) {
  return selectedTags.length > 0
    ? tagColumns.map((column) => ({
        type: "arrayOptions" as const,
        column,
        operator: "any of" as const,
        value: selectedTags,
      }))
    : [];
}

export function useTraceTagsFilter(allTraceTags: string[] | undefined) {
  const [selectedTraceTags, setSelectedTraceTagsState] = useState<string[]>([]);

  useEffect(() => {
    if (!allTraceTags) return;
    const validSelectedTags = selectedTraceTags.filter((tag) =>
      allTraceTags.includes(tag),
    );

    if (validSelectedTags.length !== selectedTraceTags.length) {
      setSelectedTraceTagsState(validSelectedTags);
    }
  }, [allTraceTags, selectedTraceTags]);

  const setSelectedTraceTags = (tags: string[]) => {
    const validTags = allTraceTags
      ? tags.filter((tag) => allTraceTags.includes(tag))
      : tags;
    setSelectedTraceTagsState(validTags);
  };

  return {
    selectedTraceTags,
    setSelectedTraceTags,
  };
}
