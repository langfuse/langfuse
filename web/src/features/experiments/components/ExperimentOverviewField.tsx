import type { ReactNode } from "react";

export const ExperimentOverviewSectionHeading = ({
  children,
}: {
  children: ReactNode;
}) => <h4 className="mb-2 text-sm font-medium">{children}</h4>;

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
