import type { ReactNode } from "react";

export const ExperimentOverviewSectionHeading = ({
  children,
}: {
  children: ReactNode;
}) => <h4 className="mb-2 text-sm font-bold">{children}</h4>;
