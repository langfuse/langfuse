import type { ReactNode } from "react";

import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import { useTranslations } from "next-intl";

export function TestSection({ content }: { content: ReactNode }) {
  const t = useTranslations("evaluationAnalytics.evaluations");
  return (
    <section className="flex shrink-0 flex-col gap-2">
      <SectionHeader
        title={t("test.sectionTitle")}
        meta={null}
        description={null}
        tooltip={t("test.sectionTooltip")}
        trailing={null}
      />
      {content}
    </section>
  );
}
