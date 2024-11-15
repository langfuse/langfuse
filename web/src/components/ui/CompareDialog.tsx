import { type Prisma } from "@langfuse/shared";
import { GitCompareIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import ReactDiffViewer from "react-diff-viewer";

interface DeleteButtonProps {
  expectedOutput?: Prisma.JsonValue | undefined;
  output?: Prisma.JsonValue | undefined;
  isLoading?: boolean;
}

export function CompareDialog({
  expectedOutput,
  output,
  isLoading,
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

  return (
    <Dialog>
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
            //stringifyJsonNode
            oldValue={JSON.stringify(expectedOutput)}
            newValue={JSON.stringify(output)}
            splitView={true}
            styles={customStyles}
          />
        ) : (
          <DialogDescription>
            The expected output and the output are not in the correct format to
            compare. Both are expected to be JSON objects.
          </DialogDescription>
        )}
      </DialogContent>
    </Dialog>
  );
}
