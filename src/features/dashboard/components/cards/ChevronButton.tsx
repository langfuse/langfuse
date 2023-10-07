import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/src/components/ui/button";

export const ChevronButton = ({
  isExpanded,
  setExpanded,
  totalLength,
  maxLength,
}: {
  isExpanded: boolean;
  setExpanded: (isExpanded: boolean) => void;
  totalLength: number;
  maxLength: number;
}) => {
  if (totalLength <= maxLength) {
    return null;
  }

  return (
    <Button
      className="mt-2"
      variant="ghost"
      onClick={() => setExpanded(!isExpanded)}
    >
      {isExpanded ? (
        <>
          <ChevronUp className="mr-2 h-4 w-4" /> See less
        </>
      ) : (
        <>
          <ChevronDown className="mr-2 h-4 w-4" /> See more
        </>
      )}
    </Button>
  );
};
