import { type timeFilter } from "@langfuse/shared";
import { type z } from "zod";

export const timeFilterToPrismaSql = (
  startTimeFilter?: z.infer<typeof timeFilter>,
) => {
  return startTimeFilter?.type === "datetime"
    ? startTimeFilter?.operator === ">="
      ? { gte: startTimeFilter.value }
      : startTimeFilter?.operator === ">"
        ? { gt: startTimeFilter.value }
        : startTimeFilter?.operator === "<="
          ? { lte: startTimeFilter.value }
          : startTimeFilter?.operator === "<"
            ? { lt: startTimeFilter.value }
            : {}
    : {};
};
