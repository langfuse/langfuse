import { type Prisma } from "@langfuse/shared";
import { GitCompareIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import ReactDiffViewer from "react-diff-viewer";
import { alignJSONStructures } from "@/src/utils/alignjson";

interface DeleteButtonProps {
  expectedOutput?: Prisma.JsonValue | undefined;
  output?: Prisma.JsonValue | undefined;
  isLoading?: boolean;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function CompareDialog({
  expectedOutput,
  output,
  isLoading,
  isOpen,
  setIsOpen,
}: DeleteButtonProps) {
  const customStyles = {
    diffContainer: {
      fontSize: "0.825rem",
      lineHeight: "15px",
    },
    contentText: {
      fontSize: "0.825rem",
      lineHeight: "15px !important",
    },
  };

  const isExpectedFormat =
    typeof expectedOutput === "object" &&
    typeof output === "object" &&
    expectedOutput !== null &&
    output !== null;

  const [expectedOutputAligned, outputAligned] = alignJSONStructures(
    expectedOutput,
    output,
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setIsOpen(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="xs" disabled={isLoading}>
          <GitCompareIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Compare output</DialogTitle>
          <DialogDescription>Expected output vs Output</DialogDescription>
        </DialogHeader>
        {isExpectedFormat ? (
          <ReactDiffViewer
            oldValue={JSON.stringify(expectedOutputAligned, null, 2)}
            newValue={JSON.stringify(outputAligned, null, 2)}
            splitView={true}
            styles={customStyles}
          />
        ) : (
          <DialogDescription className="pb-2 pt-2">
            The expected output and the output are not in the correct format to
            compare. Both are expected to be JSON objects.
          </DialogDescription>
        )}
      </DialogContent>
    </Dialog>
  );
}
