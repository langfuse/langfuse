import * as React from "react";
import { Clock, Moon, Sun } from "lucide-react";
import { type Period } from "@/src/components/ui/time-picker-utils";

export const TimeIcon: React.FC<{ date: Date | Period }> = ({ date }) => {
  if (typeof date === "string") {
    if (date === "PM") {
      return <Sun className="size-5" />;
    }
    if (date === "AM") {
      return <Moon className="size-5" />;
    }
  } else {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    if (hours === 12 && minutes === 0 && seconds === 0) {
      return <Sun className="size-5" />;
    }
    if (hours === 0 && minutes === 0 && seconds === 0) {
      return <Moon className="size-5" />;
    }
  }
  return <Clock className="size-5" />;
};
