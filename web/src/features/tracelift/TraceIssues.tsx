import { useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { api } from "@/src/utils/api";
import { getTraceliftIssuePresentation } from "./issuePresentation";

export function TraceIssues({
  projectId,
  traceId,
}: {
  projectId: string;
  traceId: string;
}) {
  const [page, setPage] = useState(0);
  const { setSelectedNodeId } = useSelection();
  const issues = api.tracelift.byTrace.useQuery({
    projectId,
    traceId,
    page,
    limit: 20,
  });

  return (
    <section
      aria-label="Trace issues"
      className="flex shrink-0 flex-col gap-3 border-b p-3"
    >
      <h3 className="text-sm font-bold">Trace issues</h3>
      {issues.isError && (
        <div role="alert" className="flex items-center gap-3 text-sm">
          <span>Could not load issues.</span>
          <Button
            text="Retry"
            variant="secondary"
            size="sm"
            onClick={() => {
              issues.refetch();
            }}
          />
        </div>
      )}
      {!issues.isError && !issues.data && (
        <div
          role="status"
          className="text-muted-foreground flex items-center gap-2 text-sm"
        >
          <Spinner size="sm" /> Loading issues…
        </div>
      )}
      {!issues.isError && issues.data && (
        <>
          {issues.data.issues.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {page === 0
                ? "No issues recorded for this trace."
                : "No more issues."}
            </p>
          ) : (
            <ul className="ph-no-capture flex flex-col gap-2">
              {issues.data.issues.map((issue, index) => (
                <li
                  key={`${issue.id}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 break-words">
                    {getTraceliftIssuePresentation(issue.issues).title}
                  </span>
                  {issue.observationId ? (
                    <Button
                      text={`Observation: ${issue.observationId}`}
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedNodeId(issue.observationId!)}
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">Trace</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {(page > 0 || issues.data?.hasMore) && (
        <div className="flex items-center gap-2">
          <Button
            text="Previous"
            size="sm"
            variant="secondary"
            disabled={page === 0 || issues.isFetching}
            onClick={() => setPage(page - 1)}
          />
          <span className="text-muted-foreground text-xs">Page {page + 1}</span>
          <Button
            text="Next"
            size="sm"
            variant="secondary"
            disabled={
              !issues.data?.hasMore || issues.isFetching || issues.isError
            }
            onClick={() => setPage(page + 1)}
          />
        </div>
      )}
    </section>
  );
}
