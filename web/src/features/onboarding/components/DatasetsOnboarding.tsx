import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { Database, Beaker, BarChart4, Zap } from "lucide-react";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";

export function DatasetsOnboarding({ projectId }: { projectId: string }) {
  const valuePropositions: ValueProposition[] = [
    {
      title: "Benchmark your models",
      description:
        "Create datasets to evaluate and compare the performance of different models and prompts",
      icon: <Beaker className="h-4 w-4" />,
    },
    {
      title: "Structured data collection",
      description:
        "Organize inputs and expected outputs for systematic testing of your LLM applications",
      icon: <Database className="h-4 w-4" />,
    },
    {
      title: "Performance analysis",
      description:
        "Track metrics across different runs to identify improvements and regressions",
      icon: <BarChart4 className="h-4 w-4" />,
    },
    {
      title: "Continuous improvement",
      description:
        "Iterate faster by testing new releases against consistent benchmarks before deployment",
      icon: <Zap className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title="Get Started with Datasets"
      description="Datasets in Langfuse are collections of inputs (and expected outputs) for your LLM application. Use them to benchmark new releases before deployment to production."
      valuePropositions={valuePropositions}
      primaryAction={{
        label: "Create Dataset",
        component: (
          <DatasetActionButton
            variant="default"
            mode="create"
            projectId={projectId}
            size="lg"
          />
        ),
      }}
      secondaryAction={{
        label: "Learn More",
        href: "https://langfuse.com/docs/datasets",
      }}
    />
  );
}
