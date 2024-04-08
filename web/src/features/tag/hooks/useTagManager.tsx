import { useState, useMemo, useEffect } from "react";

type UseTagManagerProps = {
  initialTags: string[];
  allTags: string[];
};

function useTagManager({ initialTags, allTags }: UseTagManagerProps) {
  const [selectedTags, setSelectedTags] = useState(initialTags);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    setSelectedTags(initialTags);
  }, [initialTags]);

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

export default useTagManager;
