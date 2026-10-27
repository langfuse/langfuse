import type { ReactNode } from "react";

export const ExperimentOverviewField = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div>
    <div className="text-muted-foreground text-xs">{label}</div>
    {children}
  </div>
);
