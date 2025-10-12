import React from "react";
import Header from "@/src/components/layouts/header";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { ScoreConfigsTable } from "@/src/components/table/use-cases/score-configs";
import { useTranslation } from "react-i18next";

export function ScoreConfigSettings({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const hasReadAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "scoreConfigs:read",
  });

  if (!hasReadAccess) return null;

  return (
    <div id="score-configs">
      <Header title={t("evaluation.score.configSettings.title")} />
      <p className="mb-2 text-sm">
        {
          t("evaluation.score.configSettings.description").split(
            "annotation",
          )[0]
        }
        <a
          href="https://langfuse.com/docs/evaluation/evaluation-methods/annotation"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("evaluation.score.configSettings.annotation")}
        </a>
        {
          t("evaluation.score.configSettings.description").split(
            "annotation",
          )[1]
        }
      </p>
      <ScoreConfigsTable projectId={projectId} />
    </div>
  );
}
