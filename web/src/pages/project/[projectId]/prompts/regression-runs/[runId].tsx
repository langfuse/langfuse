import { type NextPage } from "next";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
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
  TrendingUp,
} from "lucide-react";
import Header from "@/src/components/layouts/header";
import Link from "next/link";

const RegressionRunDetailsPage: NextPage = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const runId = router.query.runId as string;

  // Fetch regression run with results
  const regressionRunDetails =
    api.experiments.getRegressionRunWithResults.useQuery(
      { projectId, runId },
      { enabled: Boolean(projectId && runId) },
    );

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
                  {run.datasetRuns.length}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">
                  Total Executions
                </div>
                <div className="mt-1 text-2xl font-bold text-green-600">
                  {run.totalRuns *
                    (Array.isArray(run.promptVariants)
                      ? run.promptVariants.length
                      : 0)}
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

          {run.datasetRuns.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Clock className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p className="text-muted-foreground">
                  Dataset runs are being processed. Results will appear here as
                  they complete.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {run.datasetRuns.map((datasetRun, index) => {
                const metadata = datasetRun.metadata as any;
                const promptIndex =
                  metadata?.regression_run_prompt_index ?? index;

                return (
                  <Card
                    key={datasetRun.id}
                    className="transition-shadow hover:shadow-md"
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          Dataset Run {promptIndex + 1}: {datasetRun.name}
                        </CardTitle>
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            href={`/project/${projectId}/datasets/${run.datasetId}/runs/${datasetRun.id}`}
                          >
                            <TrendingUp className="mr-2 h-4 w-4" />
                            View Details
                          </Link>
                        </Button>
                      </div>
                      <CardDescription>
                        {datasetRun.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Prompt ID</div>
                          <div className="font-mono text-xs">
                            {metadata?.prompt_id || "Unknown"}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Model</div>
                          <div className="font-medium">
                            {metadata?.provider}/{metadata?.model || "Unknown"}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Created</div>
                          <div className="font-medium">
                            {new Date(datasetRun.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
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
                          <Badge
                            key={index}
                            variant="outline"
                            className="text-xs"
                          >
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
