import dynamic from "next/dynamic";
import { memo, type MouseEvent } from "react";

import { Skeleton } from "@/src/components/ui/skeleton";
import { shouldIgnoreRowClickTarget } from "@/src/components/table/shouldIgnoreRowClickTarget";
import { probeJsonField } from "@/src/features/traces/components/IOPreview/fns/jsonViewSizeGate";
import { cn } from "@/src/utils/tailwind";

const FormattedPreview = dynamic(
  () =>
    import("@/src/features/traces/components/IOPreview/IOPreviewPretty").then(
      (module) => module.IOPreviewPretty,
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-4 w-full" />,
  },
);

/** The detail view's Formatted renderer, bounded by its host table cell. */
export const FormattedIOTableCell = memo(function FormattedIOTableCell({
  data,
  projectId,
  field,
  traceId,
  variant,
}: FormattedIOTableCellProps) {
  /** A serialized copy keeps parser normalization out of the query cache. */
  const { serialized } = probeJsonField(data);

  return (
    <div
      className={cn(
        "ph-no-capture scrollbar-visible h-full max-h-full min-h-0 w-full min-w-0 overflow-auto overscroll-contain rounded-sm px-2 py-1",
        variant === "output" && "bg-surface-output",
      )}
      onClick={handleCellClick}
    >
      <FormattedPreview
        input={field === "input" ? serialized : undefined}
        output={field === "output" ? serialized : undefined}
        hideInput={field !== "input"}
        hideOutput={field !== "output"}
        projectId={projectId}
        traceId={traceId ?? ""}
        showCorrections={false}
        showMetadata={false}
      />
    </div>
  );
});

function handleCellClick(event: MouseEvent<HTMLDivElement>) {
  const row =
    event.target instanceof Element ? event.target.closest("tr") : null;
  /** Internal JSON rows expand independently of the host table's navigation. */
  const isPreviewRow = row !== null && event.currentTarget.contains(row);
  if (isPreviewRow || shouldIgnoreRowClickTarget(event.target)) {
    event.stopPropagation();
  }
}

type FormattedIOTableCellProps = {
  data: unknown;
  projectId: string;
  field: "input" | "output";
  traceId?: string;
  variant: "default" | "output";
};
