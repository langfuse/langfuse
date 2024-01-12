import { useState, useMemo } from "react";

type UseTagManagerProps = {
  initialTags: string[];
  availableTags: string[];
};

function useTagManager({ initialTags, availableTags }: UseTagManagerProps) {
  const [selectedTags, setSelectedTags] = useState(initialTags);
  const [inputValue, setInputValue] = useState("");

  const allTags = useMemo(
    () => availableTags.filter((value) => !selectedTags.includes(value)),
    [availableTags, selectedTags],
  );
  const handleItemCreate = () => {
    setSelectedTags([...selectedTags, inputValue]);
    availableTags.push(inputValue);
    setInputValue("");
  };

  return {
    selectedTags,
    inputValue,
    allTags,
    handleItemCreate,
    setInputValue,
    setSelectedTags,
  };
}

export default useTagManager;
