import { useTagAnalytics } from "@/src/features/tag/hooks/useTagAnalytics";
import { useState, useMemo } from "react";

type UseTagManagerProps = {
  initialTags: string[];
  allTags: string[];
};

export function useTagManager({ initialTags, allTags }: UseTagManagerProps) {
  const [selectedTags, setSelectedTags] = useState(initialTags);
  const [inputValue, setInputValue] = useState("");
  const availableTags = useMemo(
    () => allTags.filter((value) => !selectedTags.includes(value)),
    [allTags, selectedTags],
  );
  const { posthog, tableName, type } = useTagAnalytics();
  const handleItemCreate = () => {
    setSelectedTags((prevSelectedTags) => [
      // dedupe
      ...new Set([...prevSelectedTags, inputValue]),
    ]);
    posthog.capture("tag:create_new_button_click", {
      table: tableName,
      type: type,
      name: inputValue,
    });
    availableTags.push(inputValue);
    setInputValue("");
  };

  return {
    selectedTags,
    inputValue,
    availableTags,
    handleItemCreate,
    setInputValue,
    setSelectedTags,
  };
}
