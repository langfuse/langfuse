import { ConnectedIOTableCell } from "@/src/components/table/ConnectedIOTableCell";
import { FormattedIOTableCell } from "./FormattedIOTableCell";
import { type ExperimentIoRenderMode } from "@/src/features/experiments/types/experimentIoRenderMode";

export function ExperimentIOCell({
  projectId,
  field,
  mode,
  data,
  isLoading,
  isTruncated,
  variant,
  traceId,
}: ExperimentIOCellProps) {
  if (isLoading) {
    return (
      <ConnectedIOTableCell
        isLoading
        singleLine={mode === "text"}
        variant={variant}
      />
    );
  }

  if (mode !== "formatted") {
    return (
      <ConnectedIOTableCell
        data={data}
        singleLine={mode === "text"}
        variant={variant}
      />
    );
  }

  if (isTruncated) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col gap-1">
        <p className="text-muted-foreground px-2 text-xs">
          Preview truncated. Open details to view the full content.
        </p>
        <div className="min-h-0 flex-1">
          <ConnectedIOTableCell
            data={data}
            singleLine={false}
            variant={variant}
          />
        </div>
      </div>
    );
  }

  if (data === null || data === undefined || data === "") {
    return (
      <ConnectedIOTableCell data={data} singleLine={false} variant={variant} />
    );
  }

  return (
    <FormattedIOTableCell
      data={data}
      projectId={projectId}
      field={field}
      traceId={traceId}
      variant={variant}
    />
  );
}

type ExperimentIOCellProps = {
  projectId: string;
  field: "input" | "output";
  mode: ExperimentIoRenderMode;
  data: unknown;
  isLoading: boolean;
  isTruncated: boolean;
  variant: "default" | "output";
  traceId?: string;
};
