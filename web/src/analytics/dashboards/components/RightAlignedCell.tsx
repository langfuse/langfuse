/* eslint-disable @repo/no-style-props */
import { cn } from "@/src/app/utils/tailwind";
import { type ReactNode } from "react";

export const RightAlignedCell = ({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) => (
  <div className={cn("text-right", className)} title={title}>
    {children}
  </div>
);
