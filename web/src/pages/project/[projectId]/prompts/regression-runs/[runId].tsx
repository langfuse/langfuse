import { type NextPage } from "next";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  TestTube,
  BarChart3,
  ChevronDown,
  ChevronUp,
  LineChart,
} from "lucide-react";
import Header from "@/src/components/layouts/header";
import Link from "next/link";

const RegressionRunDetailsPage: NextPage = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const runId = router.query.runId as string;
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(
    new Set(),
  );

  // Fetch regression run with results
  const regressionRunDetails =
    api.experiments.getRegressionRunWithResults.useQuery(
      { projectId, runId },
      { enabled: Boolean(projectId && runId) },
    );

  const togglePrompt = (promptId: string) => {
    setExpandedPrompts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(promptId)) {
        newSet.delete(promptId);
      } else {
        newSet.add(promptId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "running":
        return <Play className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-yellow-100 text-yellow-800";
    }
  };

  if (regressionRunDetails.isLoading) {
    return (
      <>
        <Header title="Loading..." />
        <div className="container mx-auto p-6">
          <div className="py-8 text-center">
            <div className="text-muted-foreground">
              Loading regression run details...
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!regressionRunDetails.data) {
    return (
      <>
        <Header title="Regression Run Not Found" />
        <div className="container mx-auto p-6">
          <div className="py-16 text-center">
            <TestTube className="mx-auto mb-4 h-16 w-16 opacity-50" />
            <h3 className="mb-2 text-lg font-medium">
              Regression run not found
            </h3>
            <p className="mb-4 text-muted-foreground">
              The regression run you&apos;re looking for doesn&apos;t exist or
              you don&apos;t have access to it.
            </p>
            <Button asChild>
              <Link href={`/project/${projectId}/prompts/regression-runs`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Regression Runs
              </Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  const run = regressionRunDetails.data;

  return (
    <>
      <Header
        title={run.name}
        actionButtons={
          <Button variant="outline" asChild>
            <Link href={`/project/${projectId}/prompts/regression-runs`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Runs
            </Link>
          </Button>
        }
      />

      <div className="container mx-auto space-y-6 p-6">
        {/* Run Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              Regression Run Overview
            </CardTitle>
            <CardDescription>
              {run.description || "No description provided"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <div>
                <div className="text-sm text-muted-foreground">Status</div>
                <div className="mt-1 flex items-center gap-2">
                  {getStatusIcon(run.status)}
                  <Badge className={getStatusColor(run.status)}>
                    {run.status}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">
                  Prompts Tested
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {Array.isArray(run.promptVariants)
                    ? run.promptVariants.length
                    : 0}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">
                  Dataset Runs
                </div>
                <div className="mt-1 text-2xl font-bold text-blue-600">
                  {run.totalRuns ?? 0}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">
                  Total Executions
                </div>
                <div className="mt-1 text-2xl font-bold text-green-600">
                  {run.datasetRuns?.reduce(
                    (sum: number, datasetRun: any) =>
                      sum + (datasetRun.totalRuns ?? 0),
                    0,
                  ) ?? 0}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dataset Runs Results */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
            <BarChart3 className="h-5 w-5" />
            Dataset Run Results
          </h2>

          {!run.datasetRuns || run.datasetRuns.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Clock className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p className="text-muted-foreground">
                  Regression runs are being processed. Results will appear here
                  as they complete.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {run.datasetRuns.map((datasetRun: any, index: number) => {
                const isExpanded = expandedPrompts.has(
                  datasetRun.datasetItemId,
                );
                return (
                  <Card
                    key={datasetRun.datasetItemId}
                    className="transition-shadow hover:shadow-md"
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          Dataset Item {index + 1}
                        </CardTitle>
                        <div className="flex gap-2">
                          <Badge className="bg-green-100 text-green-800">
                            {datasetRun.completed} completed
                          </Badge>
                          {datasetRun.failed > 0 && (
                            <Badge className="bg-red-100 text-red-800">
                              {datasetRun.failed} failed
                            </Badge>
                          )}
                          {datasetRun.running > 0 && (
                            <Badge className="bg-blue-100 text-blue-800">
                              {datasetRun.running} running
                            </Badge>
                          )}
                        </div>
                      </div>
                      <CardDescription>
                        {datasetRun.totalRuns} total executions across{" "}
                        {datasetRun.promptResults?.length ?? 0} prompts
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">
                            Dataset Item ID
                          </div>
                          <div className="font-mono text-xs">
                            {datasetRun.datasetItemId.slice(0, 16)}...
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Model</div>
                          <div className="font-medium">
                            {run.provider}/{run.model || "Unknown"}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">
                            Success Rate
                          </div>
                          <div className="font-medium">
                            {datasetRun.totalRuns > 0
                              ? `${Math.round((datasetRun.completed / datasetRun.totalRuns) * 100)}%`
                              : "N/A"}
                          </div>
                        </div>
                      </div>

                      {/* Toggle button */}
                      <Button
                        onClick={() => togglePrompt(datasetRun.datasetItemId)}
                        className="w-full"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="mr-2 h-4 w-4" />
                            Hide Prompt Results
                          </>
                        ) : (
                          <>
                            <ChevronDown className="mr-2 h-4 w-4" />
                            Show Prompt Results (
                            {datasetRun.promptResults?.length ?? 0} prompts)
                          </>
                        )}
                      </Button>

                      {/* Expanded prompt results */}
                      {isExpanded && (
                        <div className="mt-4 space-y-3 rounded-md border bg-muted/30 p-4">
                          <div className="mb-2 text-sm font-semibold">
                            Results by Prompt
                          </div>
                          <div className="space-y-3">
                            {(datasetRun.promptResults ?? []).map(
                              (promptResult: any, promptIndex: number) => (
                                <div
                                  key={promptResult.promptId}
                                  className="rounded-md border bg-background p-3"
                                >
                                  <div className="mb-2 flex items-center justify-between">
                                    <div className="font-medium">
                                      Prompt {promptIndex + 1}
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        asChild
                                        className="h-6 px-2"
                                      >
                                        <Link
                                          href={`/project/${projectId}/prompts/regression-runs/${runId}/prompt/${promptResult.promptId}`}
                                        >
                                          <LineChart className="mr-1 h-3 w-3" />
                                          Dashboard
                                        </Link>
                                      </Button>
                                      <Badge className="bg-green-100 text-xs text-green-800">
                                        {promptResult.completed}/
                                        {promptResult.runs?.length ?? 0}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="mb-2 font-mono text-xs text-muted-foreground">
                                    {promptResult.promptId.slice(0, 24)}...
                                  </div>
                                  <div className="space-y-2">
                                    {(promptResult.runs ?? []).map(
                                      (run: any) => (
                                        <div
                                          key={run.id}
                                          className="flex items-center justify-between rounded border bg-muted/50 p-2 text-xs"
                                        >
                                          <div className="flex items-center gap-2">
                                            {getStatusIcon(run.status)}
                                            <span>Run #{run.run_number}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            {run.trace_id && (
                                              <Button
                                                asChild
                                                className="h-6 px-2"
                                              >
                                                <Link
                                                  href={`/project/${projectId}/traces/${run.trace_id}`}
                                                  target="_blank"
                                                >
                                                  View
                                                </Link>
                                              </Button>
                                            )}
                                            <span className="text-muted-foreground">
                                              {new Date(
                                                run.created_at,
                                              ).toLocaleTimeString()}
                                            </span>
                                          </div>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Configuration Details */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div>
                <div className="text-muted-foreground">Dataset ID</div>
                <div className="font-mono">{run.datasetId}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Evaluators</div>
                <div>
                  {Array.isArray(run.evaluators) &&
                  run.evaluators.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {run.evaluators.map(
                        (evaluator: string, index: number) => (
                          <Badge key={index} className="text-xs">
                            {evaluator}
                          </Badge>
                        ),
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      No evaluators configured
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Runs Per Prompt</div>
                <div className="font-medium">{run.totalRuns}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Created At</div>
                <div className="font-medium">
                  {new Date(run.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default RegressionRunDetailsPage;
