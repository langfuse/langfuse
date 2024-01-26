import { cn } from "@/src/utils/tailwind";
import { type ReactNode } from "react";

export const RightAlignedCell = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("text-right dark:text-white", className)}>{children}</div>
);
