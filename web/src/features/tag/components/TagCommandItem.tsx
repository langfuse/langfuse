import { CommandItem } from "@/src/components/ui/command";
import { cn } from "@/src/utils/tailwind";
import { Check } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useTagAnalytics } from "@/src/features/tag/hooks/useTagAnalytics";

type TagCommandItemProps = {
  value: string;
  selectedTags: string[];
  setSelectedTags: (value: string[]) => void;
};

const TagCommandItem = ({
  value,
  selectedTags,
  setSelectedTags,
}: TagCommandItemProps) => {
  const { posthog, tableName, type } = useTagAnalytics();
  return (
    <CommandItem
      key={value}
      onSelect={() => {
        setSelectedTags([...selectedTags, value]);
        posthog.capture("tag:add_existing_tag", {
          object: tableName,
          type: type,
          name: value,
        });
      }}
    >
      <div
        className={cn(
          "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary opacity-50 [&_svg]:invisible",
        )}
      >
        <Check className={cn("h-4 w-4")} />
      </div>
      <Button variant="secondary" size="xs">
        {value}
      </Button>
    </CommandItem>
  );
};

export default TagCommandItem;
