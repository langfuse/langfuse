import * as React from "react";
import { Clock, Moon, Sun } from "lucide-react";
import { type Period } from "@/src/components/ui/time-picker-utils";

const isNoon = (date: Date) =>
  date.getHours() === 12 && date.getMinutes() === 0 && date.getSeconds() === 0;

const isMidnight = (date: Date) =>
  date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;

const getIconForPeriod = (period: Period) => {
  const icons = {
    PM: <Sun className={"size-5"} />,
    AM: <Moon className={"size-5"} />,
  };

  return icons[period] || <Clock className={"size-5"} />;
};

export const TimeIcon: React.FC<{ time: Date | Period }> = ({ time }) => {
  if (time instanceof Date) {
    if (isNoon(time)) return <Sun className="size-5" />;
    if (isMidnight(time)) return <Moon className="size-5" />;
    return <Clock className="size-5" />;
  }

  return getIconForPeriod(time);
};
