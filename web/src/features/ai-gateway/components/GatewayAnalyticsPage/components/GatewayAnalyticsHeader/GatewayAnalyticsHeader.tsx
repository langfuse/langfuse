import type { ReactNode } from "react";

import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/design-system/Button/Button";
import { GATEWAY_ANALYTICS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";

export type GatewayAnalyticsHeaderProps = {
  /** Filters shown next to the title. */
  children: ReactNode;
  /** Whose requests the page covers. */
  description?: string;
};

export function GatewayAnalyticsHeader({
  children,
  description = "Cost and usage of requests made through the AI Gateway, read from its ingestion project.",
}: GatewayAnalyticsHeaderProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <Header title="Gateway analytics" className="mb-0!" />
        {children}
      </div>
      <p className="text-muted-foreground text-sm">
        {description}{" "}
        <Button
          variant="text"
          text="How gateway analytics work"
          href={GATEWAY_ANALYTICS_DOCS_URL}
        />
      </p>
    </div>
  );
}
