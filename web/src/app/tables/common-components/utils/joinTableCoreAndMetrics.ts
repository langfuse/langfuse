export function joinTableCoreAndMetrics<
  Core extends { id: string },
  Metric extends { id: string },
>(
  userCoreData?: Core[],
  userMetricsData?: Metric[],
): {
  status: "loading" | "error" | "success";
  rows: (Core & Partial<Metric>)[] | undefined;
} {
  if (!userCoreData) {
    return { status: "error", rows: undefined };
  }

  const userCoreDataProcessed = userCoreData;

  if (!userMetricsData) {
    // create an object with all the keys of the UserMetrics type with undefined value

    return {
      status: "success",
      rows: userCoreDataProcessed.map((u) => ({
        ...u,
        ...({} as Partial<Metric>),
      })),
    };
  }

  const metricsById = userMetricsData.reduce<Record<string, Metric>>(
    (acc, metric) => {
      acc[metric.id] = metric;
      return acc;
    },
    {},
  );

  const joinedData = userCoreDataProcessed.map((userCore) => {
    const metrics = metricsById[userCore.id];
    return {
      ...userCore,
      ...(metrics ?? ({} as Partial<Metric>)),
    };
  });

  return { status: "success", rows: joinedData };
}
