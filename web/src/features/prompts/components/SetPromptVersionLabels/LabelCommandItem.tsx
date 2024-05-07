import React from "react";
import { CircleCheckIcon, CircleIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { usePostHog } from "posthog-js/react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export const LabelCommandItem = (props: {
  label: string;
  selectedLabels: string[];
  setSelectedLabels: React.Dispatch<React.SetStateAction<string[]>>;
}) => {
  const { label, selectedLabels, setSelectedLabels } = props;
  const capture = usePostHogClientCapture();
  const handleLabelChange = () => {
    setSelectedLabels((prev) => {
      const newSelectedLabels = prev.includes(label)
        ? prev.filter((l) => l !== label)
        : [...prev, label];
      const status = newSelectedLabels.includes(label)
        ? "checked"
        : "unchecked";
      capture("prompt_detail:label_toggle", { status: status });
      return newSelectedLabels;
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
