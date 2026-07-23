import { InputCommandItem } from "@/src/components/ui/input-command";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Checkbox } from "@/src/components/ui/checkbox";

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
  const capture = usePostHogClientCapture();
  return (
    <InputCommandItem
      key={value}
      value={value}
      onSelect={() => {
        setSelectedTags([...selectedTags, value]);
        capture("tag:add_existing_tag", {
          name: value,
        });
      }}
    >
      <span className="mr-1">
        <Checkbox />
      </span>
      <Button variant="ghost" size="xs" className="font-normal">
        {value}
      </Button>
    </InputCommandItem>
  );
};

export default TagCommandItem;
