export type SpielwieseMetricStatus = "spotlight" | "steady" | "watch";

export type SpielwieseMetricVM = {
  id: string;
  label: string;
  value: string;
  delta: string;
  trend: string;
  status: SpielwieseMetricStatus;
};

export type SpielwieseInsightVM = {
  id: string;
  kicker: string;
  title: string;
  summary: string;
  cta: string;
};

export type SpielwieseActivityItemVM = {
  id: string;
  label: string;
  detail: string;
  value: string;
};

export type SpielwieseDashboardVM = {
  header: {
    eyebrow: string;
    title: string;
    description: string;
  };
  metrics: SpielwieseMetricVM[];
  insights: SpielwieseInsightVM[];
  activity: {
    title: string;
    description: string;
    items: SpielwieseActivityItemVM[];
  };
};
