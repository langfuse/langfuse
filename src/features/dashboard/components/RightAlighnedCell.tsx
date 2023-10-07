import { type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";

export const RightAlighnedCell = ({
  children,
  className,
  key,
}: {
  children: ReactNode;
  className?: string;
  key: number;
}) => {
  return (
    <div className={cn("mr-2 text-right", className)} key={key}>
      {children}
    </div>
  );
};
