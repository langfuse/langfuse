import { startCase } from "lodash";
import { useTranslations } from "next-intl";
import { type z } from "zod";

import { type metricAggregations } from "@langfuse/shared";
import {
  type MonitorSeverity,
  type MonitorThresholdOperator,
  type MonitorView,
  type MonitorWindow,
} from "@langfuse/shared/monitors";

const viewLabelKeys: Record<
  MonitorView,
  | "labels.views.observations"
  | "labels.views.scoresNumeric"
  | "labels.views.scoresBoolean"
  | "labels.views.scoresCategorical"
> = {
  observations: "labels.views.observations",
  "scores-numeric": "labels.views.scoresNumeric",
  "scores-boolean": "labels.views.scoresBoolean",
  "scores-categorical": "labels.views.scoresCategorical",
};

const viewDescriptionKeys: Record<
  MonitorView,
  | "form.viewDescriptions.observations"
  | "form.viewDescriptions.scoresNumeric"
  | "form.viewDescriptions.scoresBoolean"
  | "form.viewDescriptions.scoresCategorical"
> = {
  observations: "form.viewDescriptions.observations",
  "scores-numeric": "form.viewDescriptions.scoresNumeric",
  "scores-boolean": "form.viewDescriptions.scoresBoolean",
  "scores-categorical": "form.viewDescriptions.scoresCategorical",
};

const operatorLabelKeys: Record<
  MonitorThresholdOperator,
  | "labels.operators.gt"
  | "labels.operators.gte"
  | "labels.operators.lt"
  | "labels.operators.lte"
  | "labels.operators.eq"
  | "labels.operators.neq"
> = {
  GT: "labels.operators.gt",
  GTE: "labels.operators.gte",
  LT: "labels.operators.lt",
  LTE: "labels.operators.lte",
  EQ: "labels.operators.eq",
  NEQ: "labels.operators.neq",
};

const windowLabelKeys: Record<
  MonitorWindow,
  | "labels.windows.fiveMinutes"
  | "labels.windows.tenMinutes"
  | "labels.windows.fifteenMinutes"
  | "labels.windows.thirtyMinutes"
  | "labels.windows.oneHour"
  | "labels.windows.twoHours"
  | "labels.windows.fourHours"
  | "labels.windows.oneDay"
  | "labels.windows.twoDays"
  | "labels.windows.oneWeek"
> = {
  "5m": "labels.windows.fiveMinutes",
  "10m": "labels.windows.tenMinutes",
  "15m": "labels.windows.fifteenMinutes",
  "30m": "labels.windows.thirtyMinutes",
  "1h": "labels.windows.oneHour",
  "2h": "labels.windows.twoHours",
  "4h": "labels.windows.fourHours",
  "1d": "labels.windows.oneDay",
  "2d": "labels.windows.twoDays",
  "1w": "labels.windows.oneWeek",
};

const proseWindowLabelKeys: Partial<
  Record<
    MonitorWindow,
    | "labels.proseWindows.oneHour"
    | "labels.proseWindows.oneDay"
    | "labels.proseWindows.oneWeek"
  >
> = {
  "1h": "labels.proseWindows.oneHour",
  "1d": "labels.proseWindows.oneDay",
  "1w": "labels.proseWindows.oneWeek",
};

const severityLabelKeys: Record<
  MonitorSeverity,
  | "labels.severity.unknown"
  | "labels.severity.noData"
  | "labels.severity.paused"
  | "labels.severity.ok"
  | "labels.severity.warning"
  | "labels.severity.alert"
> = {
  UNKNOWN: "labels.severity.unknown",
  NO_DATA: "labels.severity.noData",
  PAUSED: "labels.severity.paused",
  OK: "labels.severity.ok",
  WARNING: "labels.severity.warning",
  ALERT: "labels.severity.alert",
};

const measureMessageKeys = {
  count: "count",
  traceId: "traceId",
  uniqueUserIds: "uniqueUserIds",
  uniqueSessionIds: "uniqueSessionIds",
  latency: "latency",
  streamingLatency: "streamingLatency",
  inputTokens: "inputTokens",
  outputTokens: "outputTokens",
  totalTokens: "totalTokens",
  outputTokensPerSecond: "outputTokensPerSecond",
  tokensPerSecond: "tokensPerSecond",
  inputCost: "inputCost",
  outputCost: "outputCost",
  totalCost: "totalCost",
  timeToFirstToken: "timeToFirstToken",
  countScores: "countScores",
  toolDefinitions: "toolDefinitions",
  toolCalls: "toolCalls",
  toolCallInvocations: "toolCallInvocations",
  costByType: "costByType",
  usageByType: "usageByType",
  value: "value",
} as const;

/** useMonitorLabels localizes monitor enums and composed metric descriptions without changing their persisted values. */
export const useMonitorLabels = () => {
  const t = useTranslations("operationsUi.monitors");

  const viewLabel = (view: MonitorView) => t(viewLabelKeys[view]);
  const viewDescription = (view: MonitorView) => t(viewDescriptionKeys[view]);
  const operatorLabel = (operator: MonitorThresholdOperator) =>
    t(operatorLabelKeys[operator]);
  const windowLabel = (window: MonitorWindow) => t(windowLabelKeys[window]);
  const aggregationLabel = (aggregation: z.infer<typeof metricAggregations>) =>
    t(`labels.aggregations.${aggregation}`);
  const severityLabel = (severity: MonitorSeverity) =>
    t(severityLabelKeys[severity]);

  const measurePresentation = (
    measure: string,
    fallbackDescription?: string,
  ) => {
    const key = measureMessageKeys[measure as keyof typeof measureMessageKeys];
    return key
      ? {
          label: t(`form.measureOptions.${key}.label`),
          description: t(`form.measureOptions.${key}.description`),
        }
      : { label: startCase(measure), description: fallbackDescription };
  };

  const metricDescription = ({
    view,
    measure,
    aggregation,
  }: {
    view: MonitorView;
    measure: string;
    aggregation: z.infer<typeof metricAggregations>;
  }) => {
    const localizedView = viewLabel(view);
    const localizedMeasure = measurePresentation(measure).label;
    const subject =
      measure === "count"
        ? localizedView
        : t("labels.metricSubject", {
            view: localizedView,
            measure: localizedMeasure,
          });
    return t("labels.metricDescription", {
      aggregation: aggregationLabel(aggregation),
      subject,
    });
  };

  const namePlaceholder = ({
    view,
    measure,
    aggregation,
    thresholdOperator,
    alertThreshold,
  }: {
    view: MonitorView;
    measure: string;
    aggregation: z.infer<typeof metricAggregations>;
    thresholdOperator: MonitorThresholdOperator;
    alertThreshold?: number | null;
  }) =>
    t("labels.namePlaceholder", {
      metric: metricDescription({ view, measure, aggregation }),
      operator: operatorLabel(thresholdOperator),
      value:
        alertThreshold != null && Number.isFinite(alertThreshold)
          ? alertThreshold
          : 0,
    });

  const chartSubtitle = ({
    view,
    measure,
    aggregation,
    window,
  }: {
    view: MonitorView;
    measure: string;
    aggregation: z.infer<typeof metricAggregations>;
    window: MonitorWindow;
  }) => {
    const proseKey = proseWindowLabelKeys[window];
    return t("labels.chartSubtitle", {
      metric: metricDescription({ view, measure, aggregation }),
      window: proseKey ? t(proseKey) : windowLabel(window),
    });
  };

  return {
    aggregationLabel,
    chartSubtitle,
    measurePresentation,
    namePlaceholder,
    operatorLabel,
    severityLabel,
    viewDescription,
    viewLabel,
    windowLabel,
  };
};
