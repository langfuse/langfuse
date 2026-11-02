import type { ReactNode } from "react";

import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";

export function SectionHeader({
  title,
  meta,
  description,
  tooltip,
  trailing,
}: {
  title: string;
  meta: ReactNode;
  description: string | null;
  tooltip: string;
  trailing: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-y-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <h3 className="shrink-0 text-sm font-bold whitespace-nowrap">
          {title}
        </h3>
        {meta}
        <InfoTooltip label={`About ${title}`}>{tooltip}</InfoTooltip>
      </div>
      {description || trailing ? (
        <div className="flex items-center gap-2">
          {description ? (
            <p className="text-muted-foreground min-w-0 flex-1 text-sm">
              {description}
            </p>
          ) : null}
          {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
