import { Button } from "@/src/components/ui/button";
import { Progress } from "@/src/components/design-system/Progress/Progress";
import { api } from "@/src/utils/api";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { BatchActionStatus } from "@langfuse/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import Link from "next/link";
import { useRouter } from "next/router";
import { Check, AlertCircle } from "lucide-react";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("operationsUi.batchActions.addToDataset.status");
  const router = useRouter();

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
            <div className="bg-primary/10 mb-4 rounded-full p-6">
              <Spinner size="xxl" variant="primary" />
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

          <h2 className="mb-2 text-2xl font-bold">
            {!isComplete && t("addingTitle")}
            {isSuccess && t("successTitle")}
            {isComplete && !isSuccess && t("issuesTitle")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {!isComplete &&
              t("addingDescription", {
                count: totalCount,
                dataset: dataset.name,
              })}
            {isSuccess &&
              t("successDescription", {
                count: processedCount,
                dataset: dataset.name,
              })}
            {isComplete &&
              !isSuccess &&
              t("issuesDescription", {
                processed: processedCount,
                failed: failedCount,
              })}
          </p>
          {!isComplete && (
            <p className="text-muted-foreground mt-2 text-sm">
              {t.rich("safeClose", {
                link: (chunks) => (
                  <Link
                    href={`/project/${projectId}/settings/batch-actions`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:no-underline"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          )}
        </div>

        {/* Progress/Results Card */}
        {(!isComplete || status.data?.log || failedCount > 0) && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {isComplete ? t("results") : t("progress")}
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
                        {t("processedOfTotal", {
                          processed: processedCount,
                          total: totalCount,
                        })}
                      </span>
                      <span className="font-bold">{progressPercent}%</span>
                    </div>
                    <Progress value={progressPercent} />
                  </div>

                  <div className="bg-muted/50 grid grid-cols-2 gap-4 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t("processed")}
                      </span>
                      <span className="font-bold">{processedCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t("failed")}
                      </span>
                      <span
                        className={`font-bold ${failedCount > 0 ? "text-destructive" : ""}`}
                      >
                        {failedCount}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {isComplete && failedCount > 0 && (
                <div className="bg-muted/50 rounded-lg p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t("successfullyProcessed")}
                    </span>
                    <span className="font-bold">{processedCount}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">{t("failed")}</span>
                    <span className="text-destructive font-bold">
                      {failedCount}
                    </span>
                  </div>
                </div>
              )}

              {status.data?.log && (
                <div className="border-destructive/50 bg-destructive/5 space-y-2 rounded-lg border p-3">
                  <p className="text-destructive text-xs font-bold">
                    {t("errorSummary")}
                  </p>
                  <pre className="text-muted-foreground max-h-32 overflow-auto text-[10px]">
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
              {t("close")}
            </Button>
            {isComplete && hasPartialSuccess && (
              <Button
                className="flex-1"
                onClick={() =>
                  router.push(
                    `/project/${projectId}/datasets/${encodeURIComponent(dataset.id)}/items`,
                  )
                }
              >
                {t("goToDataset")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
