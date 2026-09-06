import React from "react";
import {
  SplashScreen,
  type ValueProposition,
} from "@/src/components/ui/splash-screen";
import { ButtonWithIcon } from "@/src/components/ButtonWithIcon";
import { DialogTrigger } from "@/src/components/ui/dialog";
import { CreateDatasetDialogController } from "@/src/features/datasets/components/CreateDatasetDialogController";
import { Database, Beaker, Zap, Code, LockIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export function DatasetsOnboarding({ projectId }: { projectId: string }) {
  const t = useTranslations("sharedUi.onboarding");
  const valuePropositions: ValueProposition[] = [
    {
      title: t("datasets.improvementTitle"),
      description: t("datasets.improvementDescription"),
      icon: <Zap className="h-4 w-4" />,
    },
    {
      title: t("datasets.testingTitle"),
      description: t("datasets.testingDescription"),
      icon: <Beaker className="h-4 w-4" />,
    },
    {
      title: t("datasets.structuredTitle"),
      description: t("datasets.structuredDescription"),
      icon: <Database className="h-4 w-4" />,
    },
    {
      title: t("datasets.workflowsTitle"),
      description: t("datasets.workflowsDescription"),
      icon: <Code className="h-4 w-4" />,
    },
  ];

  return (
    <SplashScreen
      title={t("datasets.title")}
      description={t("datasets.description")}
      valuePropositions={valuePropositions}
      primaryAction={{
        label: t("datasets.create"),
        component: (
          <CreateDatasetDialogController
            projectId={projectId}
            target={{ type: "root" }}
          >
            {({ disabled, openDialog }) => (
              <DialogTrigger asChild>
                <ButtonWithIcon
                  size="lg"
                  disabled={disabled !== undefined}
                  onClick={openDialog}
                  variant="default"
                  icon={disabled === undefined ? PlusIcon : LockIcon}
                  text={t("datasets.new")}
                />
              </DialogTrigger>
            )}
          </CreateDatasetDialogController>
        ),
      }}
      secondaryAction={{
        label: t("learnMore"),
        href: "https://langfuse.com/docs/datasets",
      }}
      videoSrc="https://static.langfuse.com/prod-assets/onboarding/datasets-overview-v1.mp4"
    />
  );
}
