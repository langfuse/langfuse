import { z } from "zod";

export const orderBy = z
  .object({
    column: z.string(),
    order: z.enum(["ASC", "DESC"]),
  })
  .nullable();

export type OrderByState = z.infer<typeof orderBy>;

const ALL_TIME_COLUMN_ALIASES = ["timestamp", "startTime", "createdAt"];

const TIME_COLUMN_ALIASES: Record<
  "timestamp" | "startTime" | "createdAt",
  string[]
> = {
  timestamp: ALL_TIME_COLUMN_ALIASES,
  startTime: ALL_TIME_COLUMN_ALIASES,
  createdAt: ALL_TIME_COLUMN_ALIASES,
};

export const normalizeOrderByForTable = ({
  orderBy,
  expectedTimeColumn,
}: {
  orderBy: OrderByState;
  expectedTimeColumn: keyof typeof TIME_COLUMN_ALIASES;
}): OrderByState => {
  if (!orderBy) return orderBy;

  if (!TIME_COLUMN_ALIASES[expectedTimeColumn].includes(orderBy.column)) {
    return orderBy;
  }

  return {
    ...orderBy,
    column: expectedTimeColumn,
  };
};
