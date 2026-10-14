import { InputCommandItem } from "@/src/app/design-system/legacy-primitives/input-command";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import { Checkbox } from "@/src/app/design-system/Checkbox/Checkbox";

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
