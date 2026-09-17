import { ChevronDown, ChevronUp } from "lucide-react";
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
      className="mt-2"
      variant="ghost"
      onClick={() => setExpanded(!isExpanded)}
    >
      {isExpanded ? (
        <>
          <ChevronUp className="icon-lg mr-2" /> See less
        </>
      ) : (
        <>
          <ChevronDown className="icon-lg mr-2" /> {expandText}
        </>
      )}
    </Button>
  );
};
