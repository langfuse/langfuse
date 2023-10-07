import { type ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";

export const RightAlighnedCell = ({
  children,
  className: classNames,
  key,
}: {
  children: ReactNode;
  className?: string;
  key: number;
}) => {
  return (
    <div className={cn("mr-2 text-right", classNames)} key={key}>
      {children}
    </div>
  );
};
