import { useTranslation } from "next-i18next";

// Map Langfuse-managed widget ids to translation keys under common.dashboardPresets.widgets
export const WIDGET_ID_TO_KEY: Record<string, string> = {
  cmawk617300iiad07zaes6h3l: "dashboardPresets.widgets.p95LatencyByUseCase",
  cmawk6isp00kbad07t66dohjn:
    "dashboardPresets.widgets.p95LatencyByObservationLevel",
  cma2f2ioc001had07f7810kg1: "dashboardPresets.widgets.totalCosts",
  cmawk9xbu00lfad07s9j1bxnx: "dashboardPresets.widgets.topUsersByCost",
  cmawkfg0m00kzad07jyofrnq2:
    "dashboardPresets.widgets.topObservationUseCasesByCost",
  cmawk6nqs00jwad07hwpsj3z2: "dashboardPresets.widgets.topTraceUseCasesByCost",
  cmawk7btd00khad07g625cqmp: "dashboardPresets.widgets.costByEnvironment",
  cmawk94z800ldad07jjox8ugd:
    "dashboardPresets.widgets.maxLatencyByUserIdTraces",
  cmawka1fk00kdad07vdipgz04: "dashboardPresets.widgets.avgTTFTByPromptName",
  cmawksk8h00phad07s9c7v6d7: "dashboardPresets.widgets.p95TTFTByModel",
  cmawktot400pkad07m8gy30vq: "dashboardPresets.widgets.p95LatencyByModel",
  cmawl83ks001ead076pk2wcex:
    "dashboardPresets.widgets.avgOutputTokensPerSecondByModel",
  cmawle4zj0096ad0650rzeh0z: "dashboardPresets.widgets.p95CostPerTrace",
  cmawljmu100v7ad07pd3apnwe:
    "dashboardPresets.widgets.p95OutputCostPerObservation",
  cmawlkgt300vsad06g69vqqej:
    "dashboardPresets.widgets.p95InputCostPerObservation",
  cmawloc0k010uad06e4git5kz: "dashboardPresets.widgets.totalTraceCount",
  cmawlaqoa004kad07e2q0za6k: "dashboardPresets.widgets.totalCountTraces",
  cmawlbdu2004nad07lks0j8lw: "dashboardPresets.widgets.totalCountObservations",
  cmawk5sik00igad07kjetg17j: "dashboardPresets.widgets.costByModelName",
  cmawlotp500zcad076b8u704s: "dashboardPresets.widgets.totalObservationCount",
  cmawlpv4600y0ad0770qyrix9: "dashboardPresets.widgets.totalScoreCountNumeric",
  cmawlqkxk00xfad07r8zoc4ag:
    "dashboardPresets.widgets.totalScoreCountCategorical",
  cmawlrhom00xhad07phtqc81k: "dashboardPresets.widgets.totalTraceCountOverTime",
  cmawlt6wi00zmad07cvxeeepq:
    "dashboardPresets.widgets.totalObservationCountOverTime",
  cmawltpsx00yaad07f51yvkwg:
    "dashboardPresets.widgets.totalScoreCountNumericOverTime",
  cmawlu5bs00zsad07maibk7ef:
    "dashboardPresets.widgets.totalScoreCountCategoricalOverTime",
  cmawlw4s700zvad07qq4qi0gp: "dashboardPresets.widgets.totalTraceCountByEnv",
  cmawlxdo00106ad07crpey1if:
    "dashboardPresets.widgets.totalObservationCountByEnv",
};

// Map Langfuse-managed dashboard ids to translation keys under common.dashboardPresets.dashboards
export const DASHBOARD_ID_TO_KEY: Record<string, string> = {
  cmawk4ywj00jmad072jn7s0ru: "dashboardPresets.dashboards.latency",
  cmawln8k700xqad07000k1q8b: "dashboardPresets.dashboards.usage",
  cmawoi7yd00aqad07f3why08w: "dashboardPresets.dashboards.cost",
};

export function useWidgetI18n(
  widgetId: string | undefined,
  owner: "LANGFUSE" | "PROJECT" | undefined,
  fallbackName?: string,
  fallbackDescription?: string,
) {
  const { t } = useTranslation("common");
  const key = widgetId ? WIDGET_ID_TO_KEY[widgetId] : undefined;
  const name = owner === "LANGFUSE" && key ? t(`${key}.name`) : fallbackName;
  const description =
    owner === "LANGFUSE" && key ? t(`${key}.description`) : fallbackDescription;
  return { name, description };
}

export function useDashboardI18n(
  dashboardId: string | undefined,
  owner: "LANGFUSE" | "PROJECT" | undefined,
  fallbackTitle?: string,
  fallbackDescription?: string,
) {
  const { t } = useTranslation("common");
  const key = dashboardId ? DASHBOARD_ID_TO_KEY[dashboardId] : undefined;
  const title = owner === "LANGFUSE" && key ? t(`${key}.title`) : fallbackTitle;
  const description =
    owner === "LANGFUSE" && key ? t(`${key}.description`) : fallbackDescription;
  return { title, description };
}
