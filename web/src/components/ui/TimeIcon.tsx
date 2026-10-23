import * as React from "react";
import { Clock, Moon, Sun } from "@langfuse/icons";
import { type Period } from "@/src/components/ui/time-picker-utils";

const isNoon = (date: Date) =>
  date.getHours() === 12 && date.getMinutes() === 0 && date.getSeconds() === 0;

const isMidnight = (date: Date) =>
  date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;

const getIconForPeriod = (period: Period) => {
  const icons = {
    PM: <Sun size="lg" />,
    AM: <Moon size="lg" />,
  };

  return icons[period] || <Clock size="lg" />;
};

export const TimeIcon: React.FC<{ time: Date | Period }> = ({ time }) => {
  if (time instanceof Date) {
    if (isNoon(time)) return <Sun size="lg" />;
    if (isMidnight(time)) return <Moon size="lg" />;
    return <Clock size="lg" />;
  }

  return getIconForPeriod(time);
};
