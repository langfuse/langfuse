import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import {
  getPromptTabs,
  PROMPT_TABS,
} from "@/src/features/navigation/utils/prompt-tabs";
import { Button } from "@/src/components/ui/button";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";

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
  const capture = usePostHogClientCapture();

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

    try {
      const response = await fetch("/api/prompts/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: latestPrompt.id,
          promptName: latestPrompt.name,
          promptVersion: latestPrompt.version,
          projectId: projectId,
        }),
      });

      if (!response.ok) throw new Error("Optimization failed");

      const result = await response.json();
      console.log("Optimization result:", result);

      showSuccessToast({
        title: "Optimization started",
        description: "Your prompt optimization is running in the background...",
      });
    } catch (error) {
      console.error("Optimization error:", error);
      // TODO: Add error toast
    } finally {
      setIsOptimizing(false);
    }
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
              Click the button below to begin the runtime optimization process.
              This will analyze your prompt's performance and suggest
              improvements.
            </p>
          </div>

          <Button
            onClick={handleOptimization}
            loading={isOptimizing}
            disabled={isOptimizing || !latestPrompt}
            className="w-fit"
            size="lg"
          >
            <Sparkles className="h-5 w-5" />
            <span className="ml-2">Run Optimization</span>
          </Button>
        </div>

        {/* Information Section */}
        <div className="rounded-lg border bg-muted/50 p-6">
          <h3 className="mb-3 font-medium">How it works</h3>
          <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>
              Analyzes your prompt's performance metrics (latency, cost, quality
              scores)
            </li>
            <li>
              Compares different versions to identify optimization opportunities
            </li>
            <li>
              Uses AI to suggest improvements based on real-world usage patterns
            </li>
            <li>Creates a new optimized version for you to test and deploy</li>
          </ul>
        </div>
      </div>
    </Page>
  );
}
