import Header from "@/src/components/layouts/header";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";

/** IssueDetectionSettings lists the project's detected issues and queues a detection run on demand. */
export function IssueDetectionSettings({ projectId }: { projectId: string }) {
  const issues = api.adminIssues.getIssues.useQuery({ projectId });
  const runDetection = api.adminIssues.runDetection.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Issue detection queued",
        description: "Detected issues appear here once the run completes.",
      });
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <Header title="Issue Detection" />
      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-base font-bold">Run detection</p>
          <p className="text-muted-foreground text-sm">
            Check this project for issues now instead of waiting for the daily
            run.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            text="Refresh"
            variant="ghost"
            loading={issues.isFetching}
            onClick={() => void issues.refetch()}
          />
          <Button
            text="Run detection"
            variant="secondary"
            loading={runDetection.isPending}
            onClick={() => runDetection.mutate({ projectId })}
          />
        </div>
      </div>

      {issues.isPending ? (
        <p className="text-muted-foreground text-sm">Loading issues…</p>
      ) : issues.isError ? (
        <p className="text-muted-foreground text-sm">
          Could not load issues: {issues.error.message}
        </p>
      ) : issues.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No issues detected for this project yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {issues.data.map((issue) => (
            <li
              key={issue.id}
              className="flex flex-col gap-1 rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold">{issue.ruleName}</p>
                <Badge
                  label="priority"
                  text={String(issue.priority)}
                  color={issue.priority <= 1 ? "red" : "primary"}
                />
                {issue.doneAt && <Badge text="done" color="green" />}
                {issue.ignoredAt && <Badge text="ignored" />}
                <span className="text-muted-foreground text-xs">
                  {issue.createdAt.toLocaleString()}
                </span>
              </div>
              <p className="text-sm">{issue.description}</p>
              {issue.ctaLink && (
                <Button
                  href={issue.ctaLink}
                  text="Open"
                  variant="ghost"
                  size="sm"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
