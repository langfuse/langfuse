import React from "react";
import { CircleCheckIcon, CircleIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

export const LabelCommandItem = (props: {
  label: string;
  selectedLabels: string[];
  setSelectedLabels: React.Dispatch<React.SetStateAction<string[]>>;
}) => {
  const { label, selectedLabels, setSelectedLabels } = props;
  const handleLabelChange = () => {
    setSelectedLabels((prev) => {
      return prev.includes(label)
        ? prev.filter((l) => l !== label)
        : [...prev, label];
    });
  };

  const isSelected = selectedLabels.includes(label);

  return (
    <Button
      key={label}
      type="button"
      variant="ghost"
      onClick={handleLabelChange}
      className={cn(
        "w-full justify-start px-2 py-1 text-sm",
        isSelected && "font-bold",
      )}
    >
      {isSelected ? (
        <CircleCheckIcon className="mr-2 h-4 w-4" />
      ) : (
        <CircleIcon className="mr-2 h-4 w-4 opacity-20" />
      )}
      {label}
    </Button>
  );
};
