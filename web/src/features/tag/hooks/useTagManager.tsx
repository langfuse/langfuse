import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
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
  const capture = usePostHogClientCapture();
  const handleItemCreate = () => {
    setSelectedTags((prevSelectedTags) => [
      // dedupe
      ...new Set([...prevSelectedTags, inputValue]),
    ]);
    capture("tag:create_new_button_click", {
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
