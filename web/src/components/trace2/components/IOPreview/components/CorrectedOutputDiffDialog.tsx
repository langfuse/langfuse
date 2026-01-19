import React from "react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import DiffViewer from "@/src/components/DiffViewer";

type CorrectedOutputDiffDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  actualOutput?: unknown;
  correctedOutput: string;
  strictJsonMode: boolean;
};

/**
 * Formats output for diff display
 * @param output - The output to format
 * @param strictJsonMode - Whether to enforce JSON formatting
 * @returns Formatted string for display
 */
const formatOutputForDiff = (
  output: unknown,
  strictJsonMode: boolean,
): string => {
  if (output === null || output === undefined) {
    return "";
  }

  // If strict JSON mode, try to format as JSON
  if (strictJsonMode) {
    try {
      // If it's already a string, try to parse it first
      if (typeof output === "string") {
        const parsed = JSON.parse(output);
        return JSON.stringify(parsed, null, 2);
      }
      // Otherwise just stringify the object
      return JSON.stringify(output, null, 2);
    } catch {
      // If JSON formatting fails, fall back to string representation
      return typeof output === "string" ? output : JSON.stringify(output);
    }
  }

  // Non-strict mode: convert to string
  return typeof output === "string" ? output : JSON.stringify(output, null, 2);
};

export const CorrectedOutputDiffDialog: React.FC<
  CorrectedOutputDiffDialogProps
> = ({ isOpen, setIsOpen, actualOutput, correctedOutput, strictJsonMode }) => {
  // Format both outputs for comparison
  const formattedActualOutput = formatOutputForDiff(
    actualOutput,
    strictJsonMode,
  );
  const formattedCorrectedOutput = formatOutputForDiff(
    correctedOutput,
    strictJsonMode,
  );

  // Check if there's no original output to compare
  const hasNoOriginalOutput =
    actualOutput === null || actualOutput === undefined;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Output Correction Diff</DialogTitle>
          <DialogDescription>
            Compare the original output with the corrected version
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {hasNoOriginalOutput ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="text-muted-foreground">
                <p className="text-lg font-medium">No original output</p>
                <p className="mt-2 text-sm">
                  There is no original output to compare with the correction.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <DiffViewer
                oldString={formattedActualOutput}
                newString={formattedCorrectedOutput}
                oldLabel="Original Output"
                newLabel="Corrected Output"
              />
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button onClick={() => setIsOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
