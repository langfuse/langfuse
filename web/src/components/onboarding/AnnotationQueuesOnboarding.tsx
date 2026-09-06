import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { ClipboardCheck, Users, BarChart4, GitMerge } from "lucide-react";
import { CreateOrEditAnnotationQueueButton } from "@/src/features/annotation-queues/components/CreateOrEditAnnotationQueueButton";
import { useTranslations } from "next-intl";

export function AnnotationQueuesOnboarding({
  projectId,
}: {
  projectId: string;
}) {
  const t = useTranslations("sharedUi.onboarding");
  const valuePropositions: ValueProposition[] = [
    {
      title: t("annotationQueues.manageTitle"),
      description: t("annotationQueues.manageDescription"),
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
    {
      title: t("annotationQueues.collaborateTitle"),
      description: t("annotationQueues.collaborateDescription"),
      icon: <Users className="h-4 w-4" />,
    },
    {
      title: t("annotationQueues.metricsTitle"),
      description: t("annotationQueues.metricsDescription"),
      icon: <BarChart4 className="h-4 w-4" />,
    },
    {
      title: t("annotationQueues.baselineTitle"),
      description: t("annotationQueues.baselineDescription"),
      icon: <GitMerge className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title={t("annotationQueues.title")}
      description={t("annotationQueues.description")}
      valuePropositions={valuePropositions}
      primaryAction={{
        label: t("annotationQueues.create"),
        component: (
          <CreateOrEditAnnotationQueueButton
            variant="default"
            projectId={projectId}
            size="lg"
          />
        ),
      }}
      secondaryAction={{
        label: t("learnMore"),
        href: "https://langfuse.com/docs/scores/annotation",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/annotation-queue-overview-v1.mp4"
    />
  );
}
