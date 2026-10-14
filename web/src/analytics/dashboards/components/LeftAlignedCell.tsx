/* eslint-disable @repo/no-style-props */
import { cn } from "@/src/app/utils/tailwind";
import { type ReactNode } from "react";

export const LeftAlignedCell = ({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) => (
  <div className={cn("text-left", className)} title={title}>
    {children}
  </div>
);
