import Header from "@/src/components/layouts/header";
import ModelTable from "@/src/components/table/use-cases/models";
import { useTranslations } from "next-intl";

export function ModelsSettings(props: { projectId: string }) {
  const t = useTranslations("auxSettings.models");

  return (
    <>
      <Header title={t("title")} />
      <p className="mb-2 text-sm">{t("description")}</p>
      <ModelTable projectId={props.projectId} />
    </>
  );
}
