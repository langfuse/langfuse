import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type ExperimentIoRenderMode } from "@/src/features/experiments/types/experimentIoRenderMode";
import { ExperimentIOCell } from "./ExperimentIOCell";
import { type ExperimentItemsTableRow } from "./types";

export function createExperimentIOColumn({
  field,
  projectId,
  mode,
  isLoading,
  defaultHidden,
}: {
  field: "input" | "expectedOutput";
  projectId: string;
  mode: ExperimentIoRenderMode;
  isLoading: boolean;
  defaultHidden: boolean;
}): LangfuseColumnDef<ExperimentItemsTableRow> {
  const isInput = field === "input";

  return {
    ...createIOTableColumn<ExperimentItemsTableRow>({
      accessorKey: field,
      header: isInput ? "Input" : "Expected Output",
      size: 300,
      enableHiding: true,
      defaultHidden,
      singleLine: mode === "text",
      variant: isInput ? "default" : "output",
    }),
    cell: ({ row }) => (
      <ExperimentIOCell
        projectId={projectId}
        field={isInput ? "input" : "output"}
        mode={mode}
        data={
          isInput
            ? (row.original.input ?? null)
            : row.original.expectedOutput || null
        }
        isLoading={isLoading}
        isTruncated={
          (isInput
            ? row.original.inputTruncated
            : row.original.expectedOutputTruncated) ?? false
        }
        variant={isInput ? "default" : "output"}
      />
    ),
  };
}
