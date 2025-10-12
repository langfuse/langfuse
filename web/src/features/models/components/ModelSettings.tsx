import Header from "@/src/components/layouts/header";
import ModelTable from "@/src/components/table/use-cases/models";
import { useTranslation } from "react-i18next";

export function ModelsSettings(props: { projectId: string }) {
  const { t } = useTranslation();
  return (
    <>
      <Header title={t("project.settings.models.title")} />
      <p className="mb-2 text-sm">{t("project.settings.models.description")}</p>
      <ModelTable projectId={props.projectId} />
    </>
  );
}
