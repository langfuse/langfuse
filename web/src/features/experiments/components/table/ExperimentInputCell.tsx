import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ConnectedIOTableCell } from "@/src/components/table/ConnectedIOTableCell";
import { shouldIgnoreRowClickTarget } from "@/src/components/table/shouldIgnoreRowClickTarget";

export function ExperimentInputCell({
  projectId,
  datasetId,
  itemId,
  input,
  isLoading,
  singleLine,
}: {
  projectId: string;
  datasetId: string | null;
  itemId: string;
  input: string | null | undefined;
  isLoading: boolean;
  singleLine: boolean;
}) {
  const router = useRouter();
  const href = datasetId
    ? `/project/${projectId}/datasets/${datasetId}/items/${encodeURIComponent(itemId)}`
    : null;

  return (
    <div
      className={`group relative h-full w-full ${href ? "cursor-pointer pr-6" : ""}`}
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
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : null}
      {isLoading ? (
        <ConnectedIOTableCell isLoading singleLine={singleLine} />
      ) : (
        <ConnectedIOTableCell data={input ?? null} singleLine={singleLine} />
      )}
    </div>
  );
}
