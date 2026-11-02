import type { ReactNode } from "react";

import Header from "@/src/components/layouts/header";

export type GatewayAnalyticsHeaderProps = {
  /** Filters shown next to the title. */
  children: ReactNode;
};

export function GatewayAnalyticsHeader({
  children,
}: GatewayAnalyticsHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Header
        title="Gateway analytics"
        className="mb-0!"
        help={{
          description:
            "Cost and usage of requests made through the AI Gateway, read from its ingestion project.",
        }}
      />
      {children}
    </div>
  );
}
