import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { shouldIgnoreRowClickTarget } from "@/src/components/table/shouldIgnoreRowClickTarget";
import { type ExperimentIoRenderMode } from "@/src/features/experiments/types/experimentIoRenderMode";
import { ExperimentIOCell } from "./ExperimentIOCell";

export function ExperimentInputCell({
  projectId,
  datasetId,
  itemId,
  input,
  isLoading,
  ioRenderMode,
  isTruncated = false,
}: {
  projectId: string;
  datasetId: string | null;
  itemId: string;
  input: string | null | undefined;
  isLoading: boolean;
  ioRenderMode: ExperimentIoRenderMode;
  isTruncated?: boolean;
}) {
  const router = useRouter();
  const href = datasetId
    ? `/project/${projectId}/datasets/${datasetId}/items/${encodeURIComponent(itemId)}`
    : null;

  return (
    // `min-h-0 overflow-hidden` keeps this wrapper bounded to the row so the
    // IO cell's own scrollport can move. Without it the wrapper grows with the
    // JSON and the row clips the rest.
    <div
      className={`group relative h-full min-h-0 w-full overflow-hidden ${href ? "cursor-pointer pr-6" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        if (!href || shouldIgnoreRowClickTarget(event.target)) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
          window.open(href, "_blank", "noopener,noreferrer");
        } else {
          return router.push(href);
        }
      }}
    >
      {href ? (
        <Link
          href={href}
          aria-label="Open dataset item"
          className="text-muted-foreground hover:text-primary absolute top-1 right-1 rounded-sm p-0.5 focus-visible:ring-2 focus-visible:outline-none"
          onClick={(event) => event.stopPropagation()}
        >
          <ArrowUpRight className="icon-base" aria-hidden />
        </Link>
      ) : null}
      <ExperimentIOCell
        projectId={projectId}
        field="input"
        mode={ioRenderMode}
        data={input ?? null}
        isLoading={isLoading}
        isTruncated={isTruncated}
        variant="default"
      />
    </div>
  );
}
