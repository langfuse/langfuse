import { Button } from "@/src/components/ui/button";
import { Progress } from "@/src/components/ui/progress";
import { api } from "@/src/utils/api";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { BatchActionStatus } from "@langfuse/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import Link from "next/link";
import { Check, AlertCircle, Loader2 } from "lucide-react";

type StatusStepProps = {
  projectId: string;
  batchActionId: string;
  dataset: { id: string; name: string };
  expectedCount: number;
  onClose: () => void;
};

export function StatusStep({
  projectId,
  batchActionId,
  dataset,
  expectedCount,
  onClose,
}: StatusStepProps) {
  // Poll for status updates
  const status = api.batchAction.byId.useQuery(
    {
      projectId,
      batchActionId,
    },
    {
      refetchInterval: 2000, // Poll every 2 seconds
    },
  );

  // Use expectedCount as fallback when API hasn't populated totalCount yet
  const totalCount = status.data?.totalCount ?? expectedCount;
  const processedCount = status.data?.processedCount ?? 0;
  const failedCount = status.data?.failedCount ?? 0;
  const progressPercent =
    totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

  const isComplete = [
    BatchActionStatus.Completed,
    BatchActionStatus.Failed,
    BatchActionStatus.Partial,
  ].includes(status.data?.status as BatchActionStatus);
  const isSuccess = status.data?.status === BatchActionStatus.Completed;
  const hasPartialSuccess =
    status.data?.status === BatchActionStatus.Partial ||
    status.data?.status === BatchActionStatus.Completed;

  return (
    <div className="flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        {/* Status Icon and Title */}
        <div className="flex flex-col items-center text-center">
          {!isComplete && (
            <div className="mb-4 rounded-full bg-primary/10 p-6">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          )}
          {isSuccess && (
            <div className="mb-4 rounded-full bg-green-100 p-6 dark:bg-green-900/20">
              <Check className="h-12 w-12 text-green-600 dark:text-green-500" />
            </div>
          )}
          {isComplete && !isSuccess && (
            <div className="mb-4 rounded-full bg-yellow-100 p-6 dark:bg-yellow-900/20">
              <AlertCircle className="h-12 w-12 text-yellow-600 dark:text-yellow-500" />
            </div>
          )}

          <h2 className="mb-2 text-2xl font-semibold">
            {!isComplete && "Adding Observations to Dataset"}
            {isSuccess && "Successfully Added!"}
            {isComplete && !isSuccess && "Completed with Issues"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {!isComplete &&
              `Adding ${totalCount} observations to ${dataset.name}`}
            {isSuccess &&
              `${processedCount} observations have been added to ${dataset.name}`}
            {isComplete &&
              !isSuccess &&
              `${processedCount} observations added, ${failedCount} failed`}
          </p>
          {!isComplete && (
            <p className="mt-2 text-sm text-muted-foreground">
              You can safely close this dialog. The action is running in the
              background and you can track its progress in the{" "}
              <Link
                href={`/project/${projectId}/settings/batch-actions`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:no-underline"
              >
                batch actions table
              </Link>
              .
            </p>
          )}
        </div>

        {/* Progress/Results Card */}
        {(!isComplete || status.data?.log || failedCount > 0) && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {isComplete ? "Results" : "Progress"}
                </CardTitle>
                <StatusBadge
                  type={status.data?.status?.toLowerCase() ?? "pending"}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isComplete && totalCount > 0 && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {processedCount} of {totalCount} processed
                      </span>
                      <span className="font-medium">{progressPercent}%</span>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Processed</span>
                      <span className="font-semibold">{processedCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Failed</span>
                      <span
                        className={`font-semibold ${failedCount > 0 ? "text-destructive" : ""}`}
                      >
                        {failedCount}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {isComplete && failedCount > 0 && (
                <div className="rounded-lg bg-muted/50 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Successfully processed
                    </span>
                    <span className="font-semibold">{processedCount}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">Failed</span>
                    <span className="font-semibold text-destructive">
                      {failedCount}
                    </span>
                  </div>
                </div>
              )}

              {status.data?.log && (
                <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                  <p className="text-xs font-medium text-destructive">
                    Error Summary:
                  </p>
                  <pre className="max-h-32 overflow-auto text-[10px] text-muted-foreground">
                    {status.data.log}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className={isComplete && hasPartialSuccess ? "flex-1" : "w-full"}
            >
              Close
            </Button>
            {isComplete && hasPartialSuccess && (
              <Link
                href={`/project/${projectId}/datasets/${dataset.id}/items`}
                className="flex-1"
              >
                <Button className="w-full">Go to Dataset</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
