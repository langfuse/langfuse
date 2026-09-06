import Header from "@/src/components/layouts/header";
import { ScoreConfigsTable } from "@/src/components/table/use-cases/score-configs";
import { useTranslations } from "next-intl";

export function ScoreConfigSettings({ projectId }: { projectId: string }) {
  const t = useTranslations("auxSettings.scoreConfigs");

  return (
    <div id="score-configs">
      <Header title={t("title")} />
      <p className="mb-2 text-sm">
        {t.rich("description", {
          annotation: (chunks) => (
            <a
              href="https://langfuse.com/docs/evaluation/evaluation-methods/annotation"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
      <ScoreConfigsTable projectId={projectId} />
    </div>
  );
}
