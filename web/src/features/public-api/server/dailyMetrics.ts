import {
  generateDailyMetrics as _generateDailyMetrics,
  getDailyMetricsCount as _getDailyMetricsCount,
  convertApiProvidedFilterToClickhouseFilter,
} from "@langfuse/shared/src/server";

type DailyMetricsQueryProps = {
  page: number;
  limit: number;
  projectId: string;
  userId?: string;
  tags?: string | string[];
  traceName?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  traceEnvironment?: string | string[];
  observationEnvironment?: string | string[];
};

const filterParams = [
  {
    id: "userId",
    clickhouseSelect: "user_id",
    filterType: "StringFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "traceName",
    clickhouseSelect: "name",
    filterType: "StringFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "tags",
    clickhouseSelect: "tags",
    filterType: "ArrayOptionsFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "traceEnvironment",
    clickhouseSelect: "environment",
    filterType: "StringOptionsFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "observationEnvironment",
    clickhouseSelect: "environment",
    filterType: "StringOptionsFilter",
    clickhouseTable: "observations",
    clickhousePrefix: "o",
  },
  {
    id: "fromTimestamp",
    clickhouseSelect: "timestamp",
    operator: ">=" as const,
    filterType: "DateTimeFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "toTimestamp",
    clickhouseSelect: "timestamp",
    operator: "<" as const,
    filterType: "DateTimeFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
];

export const generateDailyMetrics = (props: DailyMetricsQueryProps) => {
  const filter = convertApiProvidedFilterToClickhouseFilter(
    props,
    filterParams,
  );
  return _generateDailyMetrics({
    projectId: props.projectId,
    filter,
    pagination:
      props.limit !== undefined && props.page !== undefined
        ? { limit: props.limit, page: props.page }
        : undefined,
  });
};

export const getDailyMetricsCount = (props: DailyMetricsQueryProps) => {
  const filter = convertApiProvidedFilterToClickhouseFilter(
    props,
    filterParams,
  );
  return _getDailyMetricsCount({ projectId: props.projectId, filter });
};
