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
  const handleItemCreate = () => {
    setSelectedTags([...selectedTags, inputValue]);
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
