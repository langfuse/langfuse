import * as React from "react";
import { Clock, Moon, Sun } from "lucide-react";

export const TimeIcon: React.FC<{ date: Date | undefined }> = ({ date }) => {
  if (date) {
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
