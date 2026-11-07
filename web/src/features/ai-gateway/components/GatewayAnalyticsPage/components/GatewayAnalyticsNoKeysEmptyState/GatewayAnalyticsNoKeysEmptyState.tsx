import { BookOpen, KeyRound } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";

/** Shown instead of empty analytics while the viewer has no gateway key to send requests with. */
export function GatewayAnalyticsNoKeysEmptyState({
  gatewayKeysHref,
  docsHref,
}: {
  gatewayKeysHref: string;
  docsHref: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-8 pt-24 pb-8">
      <div className="flex max-w-2xl flex-col items-center gap-6 text-center">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold">Send your first request</h2>
          <p className="text-muted-foreground text-base">
            Cost and usage show up here once requests go through the AI Gateway.
            Add a gateway key, then point your LLM client at the gateway.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            text="Add gateway key"
            icon={KeyRound}
            href={gatewayKeysHref}
          />
          <Button
            variant="outline"
            text="Read the docs"
            icon={BookOpen}
            href={docsHref}
          />
        </div>
      </div>
    </div>
  );
}
