import { minBy } from "lodash";

export const getEarliestFileCreatedAt = (
  createdAtDates: readonly Date[],
): Date | undefined => minBy(createdAtDates, (date) => date.getTime());
