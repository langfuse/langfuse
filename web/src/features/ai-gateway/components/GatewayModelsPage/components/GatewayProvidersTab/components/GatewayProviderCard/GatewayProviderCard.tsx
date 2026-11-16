import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "@langfuse/icons";

import { GatewayProviderMark } from "@/src/features/ai-gateway/components/GatewayProviderMark";
import type { GatewayModelCount } from "@/src/features/ai-gateway/components/GatewayModelsPage/types/gatewayModelCount";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type {
  GatewayConnection,
  GatewayProvider,
} from "@/src/features/ai-gateway/types/gatewayProvider";
import { cn } from "@/src/utils/tailwind";
import { describeGatewayModelCount } from "./fns/describeGatewayModelCount";

export type GatewayProviderCardProps = {
  name: string;
  provider: GatewayProvider;
  modelCount: GatewayModelCount | "loading" | undefined;
  modelsHref: string;
  /** Managers only; a rejected credential replaces the model count. */
  status?: GatewayConnection["status"];
  /** The masked credential; managers only. */
  credential?: string;
  /** Header actions, top-right; managers only. */
  actions?: ReactNode;
};

export function GatewayProviderCard({
  name,
  provider,
  modelCount,
  modelsHref,
  status,
  credential,
  actions,
}: GatewayProviderCardProps) {
  return (
    <article
      aria-label={name}
      className="ph-no-capture bg-background flex flex-col rounded-lg border"
    >
      <div className="flex items-center gap-3 p-4 pb-3">
        <GatewayProviderMark provider={provider} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate text-sm font-bold" title={name}>
            {name}
          </h3>
          <p className="text-muted-foreground text-xs">
            {providerLabels[provider]}
          </p>
        </div>
        {actions ? (
          <div className="-mt-1.5 -mr-1.5 flex shrink-0 items-center gap-0.5 self-start">
            {actions}
          </div>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 px-4 pb-4 text-sm">
        {credential !== undefined ? (
          <>
            <dt className="text-muted-foreground">API key</dt>
            <dd className="ph-no-capture truncate font-mono" title={credential}>
              {credential}
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Models</dt>
        <dd className={cn(status === "ERROR" && "text-destructive")}>
          {describeGatewayModelCount(modelCount, status)}
        </dd>
      </dl>
      <Link
        href={modelsHref}
        className="hover:bg-accent/50 hover:text-foreground focus-visible:ring-ring mt-auto flex min-h-11 items-center justify-between gap-2 rounded-b-lg border-t px-4 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset"
      >
        View models
        <ArrowRight size="sm" aria-hidden />
      </Link>
    </article>
  );
}
