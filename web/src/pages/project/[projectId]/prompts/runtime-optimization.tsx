import { useRouter } from "next/router";
import Image from "next/image";
import Page from "@/src/components/layouts/page";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import {
  getPromptTabs,
  PROMPT_TABS,
} from "@/src/features/navigation/utils/prompt-tabs";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Sparkles, Loader2, X } from "lucide-react";
import { useState, useEffect } from "react";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { OPTIMIZATION_ENVIRONMENTS } from "@langfuse/shared";

export default function RuntimeOptimization({
  promptName: promptNameProp,
}: { promptName?: string } = {}) {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const promptName =
    promptNameProp ||
    (router.query.promptName
      ? decodeURIComponent(router.query.promptName as string)
      : "");

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationStartTime, setOptimizationStartTime] = useState<
    number | null
  >(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [numIterations, setNumIterations] = useState(1);
  const [numExamples, setNumExamples] = useState(1);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState(
    OPTIMIZATION_ENVIRONMENTS[0]?.name || "",
  );
  const capture = usePostHogClientCapture();

  // Timer to show elapsed time during optimization
  useEffect(() => {
    if (!isOptimizing || !optimizationStartTime) {
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - optimizationStartTime) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [isOptimizing, optimizationStartTime]);

  // Poll job status while optimizing
  useEffect(() => {
    if (!isOptimizing || !currentJobId) {
      console.log(
        "Polling stopped - isOptimizing:",
        isOptimizing,
        "currentJobId:",
        currentJobId,
      );
      return;
    }

    console.log("Starting polling for job:", currentJobId);

    const pollInterval = setInterval(async () => {
      try {
        console.log("Polling job status for:", currentJobId);
        const response = await fetch(
          `/api/prompts/optimize/status?jobId=${currentJobId}`,
        );

        console.log("Poll response status:", response.status);

        const data = await response.json();
        console.log("Job status data:", data);

        // Handle job not found - might have been removed after completion
        if (!response.ok || data.status === "not_found") {
          console.warn("Job not found - may have been completed and removed");
          setIsOptimizing(false);
          setOptimizationStartTime(null);
          setCurrentJobId(null);
          return;
        }

        if (data.status === "completed") {
          console.log("Job completed! Showing success toast");
          setIsOptimizing(false);
          setOptimizationStartTime(null);
          setCurrentJobId(null);
          showSuccessToast({
            title: "Optimization completed!",
            description:
              "Your optimized prompt is now available. Check the prompts list for the new version.",
            duration: 10000,
          });
        } else if (data.status === "failed") {
          console.log("Job failed! Showing error toast");
          setIsOptimizing(false);
          setOptimizationStartTime(null);
          setCurrentJobId(null);
          showSuccessToast({
            title: "Optimization failed",
            description:
              data.failedReason || "An error occurred during optimization.",
            duration: 10000,
          });
        } else {
          console.log("Job still running, status:", data.status);
        }
      } catch (error) {
        console.error("Error polling job status:", error);
      }
    }, 5000); // Poll every 5 seconds

    return () => {
      console.log("Cleaning up polling interval");
      clearInterval(pollInterval);
    };
  }, [isOptimizing, currentJobId]);

  // Get the current prompt details
  const promptHistory = api.prompts.allVersions.useQuery(
    {
      name: promptName,
      projectId: projectId as string,
    },
    { enabled: Boolean(projectId) },
  );

  const latestPrompt = promptHistory.data?.promptVersions[0];

  const handleOptimization = async () => {
    if (!latestPrompt) return;

    capture("runtime_optimization:start");
    setIsOptimizing(true);
    setOptimizationStartTime(Date.now());
    setElapsedTime(0);

    try {
      const response = await fetch("/api/prompts/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: latestPrompt.id,
          promptName: latestPrompt.name,
          promptVersion: latestPrompt.version,
          projectId: projectId,
          numIterations,
          numExamples,
          promptLabel: latestPrompt.labels[0] || "",
          environment: selectedEnvironment,
        }),
      });

      if (!response.ok) throw new Error("Optimization failed");

      const result = await response.json();
      console.log("Optimization result:", result);

      // Store the job ID for status polling
      setCurrentJobId(result.jobId);

      showSuccessToast({
        title: "Optimization started",
        description:
          "Your prompt optimization is running in the background. This may take 1-2 minutes. Results will appear automatically when complete.",
        duration: 10000,
      });
    } catch (error) {
      console.error("Optimization error:", error);
      setIsOptimizing(false);
      setOptimizationStartTime(null);
      // TODO: Add error toast
    }
  };

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStopOptimization = () => {
    setIsOptimizing(false);
    setOptimizationStartTime(null);
    setElapsedTime(0);
    setCurrentJobId(null);
  };

  return (
    <Page
      headerProps={{
        title: promptName,
        itemType: "PROMPT",
        help: {
          description:
            "Runtime Prompt Optimization helps you automatically improve your prompts based on real-world usage and performance data.",
          href: "https://langfuse.com/docs/prompt-management/runtime-optimization",
        },
        breadcrumb: [
          {
            name: "Prompts",
            href: `/project/${projectId}/prompts/`,
          },
          {
            name: promptName ?? router.query.promptName,
            href: `/project/${projectId}/prompts/${encodeURIComponent(promptName)}`,
          },
          { name: "Runtime Optimization" },
        ],
        actionButtonsRight: (
          <DetailPageNav
            key="nav"
            currentId={promptName}
            path={(entry) => `/project/${projectId}/prompts/${entry.id}`}
            listKey="prompts"
          />
        ),
        tabsProps: {
          tabs: getPromptTabs(projectId, promptName),
          activeTab: PROMPT_TABS.RUNTIME_OPTIMIZATION,
        },
      }}
    >
      <div className="flex flex-col gap-6 p-6">
        {/* Header Section */}
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold">
            Runtime Prompt Optimization
          </h2>
          <p className="text-muted-foreground">
            Optimize your prompts automatically using real-world performance
            data and AI-driven improvements.
          </p>
        </div>

        {/* Current Prompt Info */}
        {latestPrompt && (
          <div className="rounded-lg border p-4">
            <h3 className="mb-2 font-medium">Current Prompt</h3>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div>
                <span className="font-medium">Version:</span>{" "}
                {latestPrompt.version}
              </div>
              <div>
                <span className="font-medium">Type:</span> {latestPrompt.type}
              </div>
              <div>
                <span className="font-medium">Labels:</span>{" "}
                {latestPrompt.labels.join(", ") || "None"}
              </div>
            </div>
          </div>
        )}

        {/* Optimization Action */}
        <div className="flex flex-col gap-4 rounded-lg border p-6">
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-medium">Start Optimization</h3>
            <p className="text-sm text-muted-foreground">
              Configure the optimization parameters and click the button below
              to begin the runtime optimization process.
            </p>
          </div>

          {/* Environment Selection - Highlighted */}
          <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="environment" className="text-base font-medium">
                Optimization Environment
              </Label>
              <Select
                value={selectedEnvironment}
                onValueChange={setSelectedEnvironment}
                disabled={isOptimizing}
              >
                <SelectTrigger id="environment" className="bg-background">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  {OPTIMIZATION_ENVIRONMENTS.map((env) => (
                    <SelectItem key={env.name} value={env.name}>
                      {env.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select which optimization script to run
              </p>
            </div>
          </div>

          {/* Configuration Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="numIterations">Number of Iterations</Label>
              <Input
                id="numIterations"
                type="number"
                min={1}
                max={3}
                value={numIterations}
                onChange={(e) => setNumIterations(Number(e.target.value))}
                disabled={isOptimizing}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="numExamples">Number of Trajectories</Label>
              <Input
                id="numExamples"
                type="number"
                min={1}
                max={5}
                value={numExamples}
                onChange={(e) => setNumExamples(Number(e.target.value))}
                disabled={isOptimizing}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Button
                onClick={handleOptimization}
                loading={isOptimizing}
                disabled={isOptimizing || !latestPrompt}
                className="w-fit"
                size="lg"
              >
                {isOptimizing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="ml-2">Optimizing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    <span className="ml-2">Run Optimization</span>
                  </>
                )}
              </Button>

              {isOptimizing && (
                <Button
                  onClick={handleStopOptimization}
                  variant="outline"
                  size="lg"
                >
                  <X className="h-5 w-5" />
                  <span className="ml-2">Stop</span>
                </Button>
              )}
            </div>

            {isOptimizing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  Running optimization... {formatElapsedTime(elapsedTime)}{" "}
                  elapsed (expected: 1-2 minutes)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Information Section */}
        <div className="rounded-lg border bg-muted/50 p-6">
          <h3 className="mb-4 font-medium">How it works</h3>

          {/* Diagram */}
          <div className="mb-6 overflow-x-auto rounded-lg bg-white p-4">
            <div className="min-w-[800px]">
              <Image
                src="/diagram_prompt_opt.png"
                alt="Runtime Prompt Optimization Process"
                width={1123}
                height={255}
                className="h-auto w-full"
                priority={false}
              />
            </div>
          </div>

          <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>Generate set of trajectories using the current prompt</li>
            <li>
              Evaluate the trajectories using the evaluation framework and
              collect feedback
            </li>
            <li>
              Use AI to generate new prompt based on the evaluation feedback
            </li>
            <li>Deploy the new prompt to the prompt management system</li>
          </ul>
        </div>
      </div>
    </Page>
  );
}
