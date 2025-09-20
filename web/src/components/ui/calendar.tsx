"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { DayPicker, UI, SelectionState, DayFlag } from "react-day-picker";

import { cn } from "@/src/utils/tailwind";
import { buttonVariants } from "@/src/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  disabled,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      disabled={disabled}
      classNames={{
        [UI.Months]: "flex relative",
        [UI.Month]: "space-y-4",
        [UI.MonthCaption]: "flex justify-center items-center h-7",
        [UI.CaptionLabel]: "text-sm font-medium",
        [UI.PreviousMonthButton]: cn(
          buttonVariants({ variant: "outline" }),
          "absolute left-1 top-0 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        [UI.NextMonthButton]: cn(
          buttonVariants({ variant: "outline" }),
          "absolute right-1 top-0 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        [UI.MonthGrid]: "w-full border-collapse space-y-1",
        [UI.Weekdays]: "flex",
        [UI.Weekday]:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        [UI.Week]: "flex w-full mt-2",
        [UI.Day]:
          "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
        [UI.DayButton]: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
          // can't use SelectionState.range_start here because Tailwind classes can't be constructed dynamically
          "group-[.selection-edge]:bg-primary group-[.selection-edge]:text-primary-foreground group-[.today]:font-semibold",
        ),
        [SelectionState.range_start]:
          "group selection-edge bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground rounded-l-md rounded-r-none",
        [SelectionState.range_middle]:
          "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground rounded-none",
        [SelectionState.range_end]:
          "group selection-edge bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground rounded-r-md rounded-l-none",
        [SelectionState.selected]:
          "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground rounded-md",
        [DayFlag.today]: "group today",
        [DayFlag.outside]:
          "text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        [DayFlag.disabled]: "text-muted-foreground opacity-50",
        [DayFlag.hidden]: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ ...props }) => <Chevron {...props} />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

const Chevron = ({ orientation = "left" }) => {
  switch (orientation) {
    case "left":
      return <ChevronLeft className="h-4 w-4" />;
    case "right":
      return <ChevronRight className="h-4 w-4" />;
    case "up":
      return <ChevronUp className="h-4 w-4" />;
    case "down":
      return <ChevronDown className="h-4 w-4" />;
    default:
      return null;
  }
};

export { Calendar };
