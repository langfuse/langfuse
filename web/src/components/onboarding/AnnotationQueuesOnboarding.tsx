import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { ClipboardCheck, Users, BarChart4, GitMerge } from "lucide-react";
import { CreateOrEditAnnotationQueueButton } from "@/src/features/annotation-queues/components/CreateOrEditAnnotationQueueButton";

export function AnnotationQueuesOnboarding({
  projectId,
}: {
  projectId: string;
}) {
  const valuePropositions: ValueProposition[] = [
    {
      title: "Manage scoring workflows",
      description:
        "Create and manage annotation queues to streamline your scoring workflows",
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
    {
      title: "Collaborate with annotators",
      description:
        "Invite team members to annotate and evaluate your LLM outputs",
      icon: <Users className="h-4 w-4" />,
    },
    {
      title: "Track annotation metrics",
      description:
        "Monitor annotation progress and quality metrics across your team",
      icon: <BarChart4 className="h-4 w-4" />,
    },
    {
      title: "Baseline evaluation efforts",
      description:
        "Use annotation data as a baseline to evaluate your other evaluation metrics",
      icon: <GitMerge className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title="Get Started with Annotation Queues"
      description="Annotation queues help you manage manual annotation/labeling for your LLM projects. Create queues, define annotation metrics, and track progress."
      valuePropositions={valuePropositions}
      primaryAction={{
        label: "Create Annotation Queue",
        component: (
          <CreateOrEditAnnotationQueueButton
            variant="default"
            projectId={projectId}
            size="lg"
          />
        ),
      }}
      secondaryAction={{
        label: "Learn More",
        href: "https://langfuse.com/docs/scores/annotation",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/annotation-queue-overview-v1.mp4"
    />
  );
}
