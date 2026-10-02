import { useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { api } from "@/src/utils/api";
import {
  getTraceliftIssuePresentation,
  isTraceliftIssue,
} from "./issuePresentation";

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
    limit: 100,
  });

  const visibleIssues =
    issues.data?.issues.flatMap((issue) =>
      isTraceliftIssue(issue.issues)
        ? [
            {
              ...issue,
              title: getTraceliftIssuePresentation(issue.issues).title,
            },
          ]
        : [],
    ) ?? [];

  return (
    <section
      aria-label="Instrumentation suggestions"
      className="flex shrink-0 flex-col gap-3 border-b p-3"
    >
      <h3 className="text-sm font-bold">Instrumentation suggestions</h3>
      {issues.isError && (
        <div role="alert" className="flex items-center gap-3 text-sm">
          <span>Could not load suggestions.</span>
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
          <Spinner size="sm" /> Loading suggestions…
        </div>
      )}
      {!issues.isError && issues.data && (
        <>
          {visibleIssues.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No current suggestions on this page.
            </p>
          ) : (
            <ul className="ph-no-capture flex flex-col gap-2">
              {visibleIssues.map((issue, index) => (
                <li
                  key={`${issue.id}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 break-words">{issue.title}</span>
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
