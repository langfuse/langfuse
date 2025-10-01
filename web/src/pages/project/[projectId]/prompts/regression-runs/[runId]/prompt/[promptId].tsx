import { type NextPage } from "next";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Page from "@/src/components/layouts/page";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useMemo } from "react";

const RegressionRunPromptDashboardPage: NextPage = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const runId = router.query.runId as string;
  const promptId = router.query.promptId as string;

  // Fetch regression run details
  const run = api.experiments.getRegressionRunById.useQuery(
    { projectId, runId },
    { enabled: Boolean(projectId && runId) },
  );

  // Fetch prompt details to get the dataset runs for this specific prompt
  const promptRunItems = api.experiments.getRegressionRunItemsByPrompt.useQuery(
    { projectId, runId, promptId },
    { enabled: Boolean(projectId && runId && promptId) },
  );

  // Extract all unique score names across all runs
  const scoreNames = useMemo(() => {
    if (!promptRunItems.data) return [];
    const names = new Set<string>();
    promptRunItems.data.forEach((item) => {
      item.runs.forEach((run) => {
        run.scores?.forEach((score) => {
          names.add(score.name);
        });
      });
    });
    return Array.from(names).sort();
  }, [promptRunItems.data]);

  if (run.isLoading || promptRunItems.isLoading) {
    return (
      <Page
        headerProps={{
          title: "Loading...",
          breadcrumb: [
            { name: "Prompts", href: `/project/${projectId}/prompts` },
            {
              name: "Regression Runs",
              href: `/project/${projectId}/prompts/regression-runs`,
            },
            {
              name: runId,
              href: `/project/${projectId}/prompts/regression-runs/${runId}`,
            },
          ],
        }}
      >
        <div className="flex h-full items-center justify-center">
          <Skeleton className="h-64 w-full" />
        </div>
      </Page>
    );
  }

  if (!run.data || !promptRunItems.data) {
    return (
      <Page
        headerProps={{
          title: "Not Found",
          breadcrumb: [
            { name: "Prompts", href: `/project/${projectId}/prompts` },
            {
              name: "Regression Runs",
              href: `/project/${projectId}/prompts/regression-runs`,
            },
          ],
        }}
      >
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">
            Regression run or prompt data not found
          </p>
          <Button asChild>
            <Link
              href={`/project/${projectId}/prompts/regression-runs/${runId}`}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Run
            </Link>
          </Button>
        </div>
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: `Prompt Dashboard - ${promptId.slice(0, 8)}`,
        itemType: "DATASET_RUN",
        breadcrumb: [
          { name: "Prompts", href: `/project/${projectId}/prompts` },
          {
            name: "Regression Runs",
            href: `/project/${projectId}/prompts/regression-runs`,
          },
          {
            name: run.data.name,
            href: `/project/${projectId}/prompts/regression-runs/${runId}`,
          },
        ],
        actionButtonsRight: (
          <Button asChild>
            <Link
              href={`/project/${projectId}/prompts/regression-runs/${runId}`}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Run
            </Link>
          </Button>
        ),
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-auto p-3">
          <div className="space-y-6">
            {promptRunItems.data.map((item, index) => (
              <div
                key={item.datasetItemId}
                className="rounded-lg border bg-card"
              >
                <div className="border-b bg-muted/50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Dataset Item {index + 1}</h3>
                    <div className="flex gap-2 text-sm">
                      <span className="text-muted-foreground">
                        {item.completed}/{item.totalRuns} completed
                      </span>
                      {item.failed > 0 && (
                        <span className="text-destructive">
                          {item.failed} failed
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    {item.datasetItemId}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium">
                          Run #
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium">
                          Status
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium">
                          Trace ID
                        </th>
                        {scoreNames.map((scoreName) => (
                          <th
                            key={scoreName}
                            className="px-4 py-2 text-left text-xs font-medium"
                          >
                            {scoreName}
                          </th>
                        ))}
                        <th className="px-4 py-2 text-left text-xs font-medium">
                          Created At
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.runs.map((runItem) => {
                        // Create a map of score names to values for this run
                        const scoreMap = new Map<string, string>(
                          runItem.scores?.map((s) => [
                            s.name,
                            s.dataType === "NUMERIC"
                              ? (s.value?.toFixed(2) ?? "-")
                              : (s.stringValue ?? "-"),
                          ]) ?? [],
                        );

                        return (
                          <tr
                            key={runItem.id}
                            className="border-b last:border-0 hover:bg-muted/50"
                          >
                            <td className="px-4 py-3 text-sm">
                              Run #{runItem.runNumber}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                  runItem.status === "completed"
                                    ? "bg-green-100 text-green-800"
                                    : runItem.status === "failed"
                                      ? "bg-red-100 text-red-800"
                                      : runItem.status === "running"
                                        ? "bg-blue-100 text-blue-800"
                                        : "bg-yellow-100 text-yellow-800"
                                }`}
                              >
                                {runItem.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                              {runItem.traceId?.slice(0, 8)}...
                            </td>
                            {scoreNames.map((scoreName) => (
                              <td key={scoreName} className="px-4 py-3 text-sm">
                                {scoreMap.get(scoreName) ?? "-"}
                              </td>
                            ))}
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {new Date(runItem.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {runItem.traceId && (
                                <Button asChild>
                                  <Link
                                    href={`/project/${projectId}/traces/${runItem.traceId}`}
                                    target="_blank"
                                  >
                                    View Trace
                                  </Link>
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
};

export default RegressionRunPromptDashboardPage;
