import preview from "../../../../../../../.storybook/preview";
import { EvaluatorAlertButton } from "./EvaluatorAlertButton";

const meta = preview.meta({ component: EvaluatorAlertButton });

const alertDefaults = {
  status: "ACTIVE",
  metric: { measure: "value", aggregation: "avg" },
  thresholdOperator: "LT",
  alertThreshold: 0.7,
  alertedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
} as const;

const defaultArgs = {
  projectId: "project-1",
  scope: "evaluator" as const,
  evaluatorId: "evaluator-1",
  evaluatorType: "LLM_AS_JUDGE" as const,
  scoreDataType: "NUMERIC" as const,
  connectedAlerts: [],
  canRead: true,
  canCreate: true,
};

export const NoAlerts = meta.story({ args: defaultArgs });

export const ConnectedAlerts = meta.story({
  args: {
    ...defaultArgs,
    connectedAlerts: [
      {
        ...alertDefaults,
        id: "alert-1",
        name: "Accuracy dropped",
        severity: "ALERT",
      },
      {
        ...alertDefaults,
        id: "alert-2",
        name: "Evaluator spend increased",
        severity: "WARNING",
        metric: { measure: "totalCost", aggregation: "sum" },
        thresholdOperator: "GT",
        alertThreshold: 10,
      },
      {
        ...alertDefaults,
        id: "alert-3",
        name: "Low quality score",
        severity: "OK",
      },
    ],
  },
});

export const CodeEvaluator = meta.story({
  args: {
    ...defaultArgs,
    evaluatorType: "CODE",
    scoreDataType: "BOOLEAN",
  },
});

export const LoadingSpinner = meta.story({
  args: { ...defaultArgs, isLoading: true },
});

export const ReadOnly = meta.story({
  args: {
    ...defaultArgs,
    connectedAlerts: [
      {
        ...alertDefaults,
        id: "alert-1",
        name: "Accuracy dropped",
        status: "PAUSED",
        severity: "PAUSED",
      },
    ],
    canCreate: false,
  },
});

export const LimitReached = meta.story({
  args: { ...defaultArgs, limitReached: true },
});

export const AggregateCost = meta.story({
  args: {
    projectId: "project-1",
    scope: "allEvaluators",
    connectedAlerts: [],
    canRead: true,
    canCreate: true,
  },
});

export const AggregateCostConnected = meta.story({
  args: {
    projectId: "project-1",
    scope: "allEvaluators",
    connectedAlerts: [
      {
        ...alertDefaults,
        id: "alert-1",
        name: "Weekly evaluator cost",
        severity: "OK",
        metric: { measure: "totalCost", aggregation: "sum" },
        thresholdOperator: "GT",
        alertThreshold: 50,
      },
    ],
    canRead: true,
    canCreate: true,
  },
});
