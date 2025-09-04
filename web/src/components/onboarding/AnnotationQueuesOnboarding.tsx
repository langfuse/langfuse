import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { ClipboardCheck, Users, BarChart4, GitMerge } from "lucide-react";
import { CreateOrEditAnnotationQueueButton } from "@/src/features/annotation-queues/components/CreateOrEditAnnotationQueueButton";
import { useTranslation } from "next-i18next";

export function AnnotationQueuesOnboarding({
  projectId,
}: {
  projectId: string;
}) {
  const { t } = useTranslation("common");
  const valuePropositions: ValueProposition[] = [
    {
      title: t("onboarding.annotationQueues.vp.manageWorkflows.title"),
      description: t(
        "onboarding.annotationQueues.vp.manageWorkflows.description",
      ),
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
    {
      title: t("onboarding.annotationQueues.vp.collaborate.title"),
      description: t("onboarding.annotationQueues.vp.collaborate.description"),
      icon: <Users className="h-4 w-4" />,
    },
    {
      title: t("onboarding.annotationQueues.vp.trackMetrics.title"),
      description: t("onboarding.annotationQueues.vp.trackMetrics.description"),
      icon: <BarChart4 className="h-4 w-4" />,
    },
    {
      title: t("onboarding.annotationQueues.vp.baseline.title"),
      description: t("onboarding.annotationQueues.vp.baseline.description"),
      icon: <GitMerge className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title={t("onboarding.annotationQueues.title")}
      description={t("onboarding.annotationQueues.description")}
      valuePropositions={valuePropositions}
      primaryAction={{
        label: t("onboarding.annotationQueues.createQueue"),
        component: (
          <CreateOrEditAnnotationQueueButton
            variant="default"
            projectId={projectId}
            size="lg"
          />
        ),
      }}
      secondaryAction={{
        label: t("onboarding.learnMore"),
        href: "https://langfuse.com/docs/scores/annotation",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/annotation-queue-overview-v1.mp4"
    />
  );
}
