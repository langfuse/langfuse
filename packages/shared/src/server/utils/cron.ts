import { CronExpressionParser } from "cron-parser";

export const validateExpression = (cronExpression: string): boolean => {
  if (!cronExpression || cronExpression.trim() === "") {
    return false;
  }

  try {
    CronExpressionParser.parse(cronExpression, { tz: "UTC" });
    return true;
  } catch {
    return false;
  }
};

export const calculateNextDate = (
  cronExpression: string,
  currentTime: Date = new Date(),
): Date => {
  const interval = CronExpressionParser.parse(cronExpression, {
    currentDate: currentTime,
    tz: "UTC",
  });
  return interval.next().toDate();
};
