import { z } from "zod/v4";

export const orderBy = z
  .object({
    column: z.string(),
    order: z.enum(["ASC", "DESC"]),
  })
  .nullable();

export type OrderByState = z.infer<typeof orderBy>;

const TIME_COLUMN_ALIASES: Record<
  "timestamp" | "startTime" | "createdAt",
  string[]
> = {
  timestamp: ["timestamp", "startTime", "createdAt"],
  startTime: ["timestamp", "startTime", "createdAt"],
  createdAt: ["timestamp", "startTime", "createdAt"],
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
