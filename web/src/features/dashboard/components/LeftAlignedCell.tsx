import { cn } from "@/src/utils/tailwind";
import { type ReactNode } from "react";

export const LeftAlignedCell = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => <div className={cn("text-left", className)}>{children}</div>;
