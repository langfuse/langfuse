import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";

type SessionCoreFields = {
  id: string;
  createdAt?: Date;
  bookmarked?: boolean;
  public?: boolean;
  userIds?: string[];
  countTraces?: number;
  traceTags?: string[];
  environment?: string;
};

const pickSessionCoreFields = <Core extends SessionCoreFields>(core: Core) => ({
  id: core.id,
  createdAt: core.createdAt,
  bookmarked: core.bookmarked,
  public: core.public,
  userIds: core.userIds,
  countTraces: core.countTraces,
  traceTags: core.traceTags,
  environment: core.environment,
});

export function joinSessionCoreAndMetrics<
  Core extends SessionCoreFields,
  Metric extends { id: string },
>(
  sessionCoreData?: Core[],
  sessionMetricsData?: Metric[],
): {
  status: "loading" | "error" | "success";
  rows: (Core & Partial<Metric>)[] | undefined;
} {
  const joinedData = joinTableCoreAndMetrics<Core, Metric>(
    sessionCoreData,
    sessionMetricsData,
  );

  if (!joinedData.rows || !sessionCoreData) {
    return joinedData;
  }

  const coreById = sessionCoreData.reduce<Record<string, Core>>((acc, core) => {
    acc[core.id] = core;
    return acc;
  }, {});

  return {
    ...joinedData,
    rows: joinedData.rows.map((row) => {
      const core = coreById[row.id];

      // Session metrics can be all-time scoped in v3, while core rows are filtered and sorted.
      return core ? { ...row, ...pickSessionCoreFields(core) } : row;
    }),
  };
}
