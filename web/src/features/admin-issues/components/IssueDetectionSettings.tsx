import { useState } from "react";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/design-system/Button/Button";
import { IssueDetectionView } from "@/src/features/admin-issues/components/IssueDetectionView/IssueDetectionView";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";

export function IssueDetectionSettings({ projectId }: { projectId: string }) {
  const utils = api.useUtils();
  const [pollAfterRun, setPollAfterRun] = useState(false);
  const issues = api.adminIssues.getIssues.useQuery(
    { projectId },
    { refetchInterval: pollAfterRun ? 15000 : false },
  );
  const refresh = () => utils.adminIssues.getIssues.invalidate({ projectId });
  const runDetection = api.adminIssues.runDetection.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Issue detection queued",
        description: "Refresh the list once the run completes.",
      });
      setPollAfterRun(true);
      return refresh();
    },
  });
  const setIgnored = api.adminIssues.setIgnored.useMutation({
    onSuccess: refresh,
  });
  const setDone = api.adminIssues.setDone.useMutation({ onSuccess: refresh });
  const busyIssueId = setIgnored.isPending
    ? setIgnored.variables.issueId
    : (setDone.isPending && setDone.variables.issueId) || null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Header title="Issue Detection" />
          <p className="text-muted-foreground text-sm">
            Langfuse checks this project for issues once a day.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            text="Run detection"
            variant="primary"
            loading={runDetection.isPending}
            onClick={() => runDetection.mutate({ projectId })}
          />
        </div>
      </div>
      {issues.isPending && (
        <p className="text-muted-foreground text-sm">Loading issues…</p>
      )}
      {issues.isError && (
        <p role="alert" className="text-destructive text-sm">
          Could not load issues: {issues.error.message}
        </p>
      )}
      {issues.isSuccess && (
        <IssueDetectionView
          issues={issues.data}
          busyIssueId={busyIssueId}
          onIgnore={(issue, ignored) =>
            setIgnored.mutate({ projectId, issueId: issue.id, ignored })
          }
          onDone={(issue, done) =>
            setDone.mutate({ projectId, issueId: issue.id, done })
          }
        />
      )}
      {(setIgnored.isError || setDone.isError || runDetection.isError) && (
        <p role="alert" className="text-destructive text-sm">
          {setIgnored.error?.message ??
            setDone.error?.message ??
            runDetection.error?.message}
        </p>
      )}
    </div>
  );
}
