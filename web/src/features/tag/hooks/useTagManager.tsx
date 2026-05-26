import { useState, useMemo } from "react";

import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/** useTagManager exposes the input buffer, autocomplete list, and create-tag handler for TagManager; tag-list state itself stays on the parent. */
export function useTagManager({
  tags,
  allTags,
  mutateTags,
}: {
  tags: string[];
  allTags: string[];
  mutateTags: (next: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const availableTags = useMemo(
    () => allTags.filter((value) => !tags.includes(value)),
    [allTags, tags],
  );
  const capture = usePostHogClientCapture();

  const handleItemCreate = () => {
    mutateTags([...new Set([...tags, inputValue])]);
    capture("tag:create_new_button_click", { name: inputValue });
    setInputValue("");
  };

  return {
    inputValue,
    availableTags,
    handleItemCreate,
    setInputValue,
  };
}
