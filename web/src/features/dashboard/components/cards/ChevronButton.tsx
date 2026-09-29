import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { Button } from "@/src/components/ui/button";

export const ExpandListButton = ({
  isExpanded,
  setExpanded,
  expandText = "See more",
}: {
  isExpanded: boolean;
  setExpanded: (isExpanded: boolean) => void;
  expandText?: string;
}) => {
  return (
    <Button
      className="mt-2 gap-2"
      variant="ghost"
      onClick={() => setExpanded(!isExpanded)}
    >
      {isExpanded ? (
        <>
          <DropdownIndicator direction="up" nudge />
          See less
        </>
      ) : (
        <>
          <DropdownIndicator nudge />
          {expandText}
        </>
      )}
    </Button>
  );
};
