import { CircleArrowDown } from "lucide-react";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import type { OmaiScoreConfig } from "./score-config";

interface AddScoreButtonProps extends OmaiScoreConfig {
  allUserScores: string[];
  onScoreSelect: (scoreValue: string, configId: string) => void;
}

export const AddScoreButton = ({
  id,
  label,
  options,
  allUserScores,
  onScoreSelect,
}: AddScoreButtonProps) => {
  return (
    <Popover>
      <PopoverTrigger>
        <button
          key={id}
          className="flex gap-2 whitespace-nowrap rounded-full bg-secondary px-2 py-1 text-secondary-foreground transition-all hover:scale-[1.02] hover:bg-secondary/80"
        >
          <CircleArrowDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="line-clamp-1 text-xs text-muted-foreground">
            {label}
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        sideOffset={6}
        align="start"
        className="p-0"
      >
        <div className="grid">
          {options.map((option) => {
            return (
              <PopoverClose asChild key={option}>
                <button
                  className={`px-2 py-2 text-left text-xs hover:bg-secondary ${
                    allUserScores.includes(option)
                      ? "cursor-not-allowed bg-secondary/60 text-muted-foreground"
                      : "bg-secondary/40 text-secondary-foreground"
                  }`}
                  disabled={allUserScores.includes(option.trim())}
                  onClick={() => {
                    // Don't add if it already exists (either in existing or new scores)
                    if (!allUserScores.includes(option.trim())) {
                      onScoreSelect(option.trim(), id);
                    }
                  }}
                >
                  {option}
                </button>
              </PopoverClose>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
