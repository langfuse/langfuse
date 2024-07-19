// dashboard.ts
import {
  dashboardDateRangeAggregationOptions,
  findClosestInterval,
  type DashboardDateRangeAggregationOption,
  type DateRangeAggregationSettings,
} from "@/src/utils/date-range-utils";
import { type DateRange } from "react-day-picker";

export const dashboardDateRangeAggregationSettings: DateRangeAggregationSettings<DashboardDateRangeAggregationOption> =
  {
    "1 year": {
      date_trunc: "month",
      date_formatter: (date) =>
        date.toLocaleDateString("en-US", { year: "2-digit", month: "short" }),
      minutes: 365 * 24 * 60,
    },
    "3 months": {
      date_trunc: "month",
      date_formatter: (date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 3 * 30 * 24 * 60,
    },
    "1 month": {
      date_trunc: "month",
      date_formatter: (date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 30 * 24 * 60,
    },
    "7 days": {
      date_trunc: "day",
      date_formatter: (date) =>
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      minutes: 7 * 24 * 60,
    },
    "24 hours": {
      date_trunc: "hour",
      date_formatter: (date) =>
        date.toLocaleTimeString("en-US", { hour: "numeric" }),
      minutes: 24 * 60,
    },
    "3 hours": {
      date_trunc: "hour",
      date_formatter: (date) =>
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
        }),
      minutes: 3 * 60,
    },
    "1 hour": {
      date_trunc: "hour",
      date_formatter: (date) =>
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
        }),
      minutes: 60,
    },
    "30 minutes": {
      date_trunc: "minute",
      date_formatter: (date) =>
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
        }),
      minutes: 30,
    },
    "5 minutes": {
      date_trunc: "minute",
      date_formatter: (date) =>
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "numeric",
        }),
      minutes: 5,
    },
  };

export const findClosestDashboardInterval = (
  dateRange: DateRange,
): DashboardDateRangeAggregationOption | undefined => {
  if (!dateRange.from || !dateRange.to) return undefined;
  const duration = dateRange.to.getTime() - dateRange.from.getTime();
  return findClosestInterval(
    dashboardDateRangeAggregationOptions,
    dashboardDateRangeAggregationSettings,
    duration,
  );
};
