import { type Key, type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";

export const RightAlignedCell = ({
  children,
  className,
  key,
}: {
  children: ReactNode;
  className?: string;
  key?: Key;
}) => {
  return (
    <div className={cn("text-right", className)} key={key}>
      {children}
    </div>
  );
};
