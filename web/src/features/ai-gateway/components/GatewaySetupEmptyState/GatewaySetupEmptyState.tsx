import type { IconComponent } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";

type GatewaySetupEmptyStateAction = {
  label: string;
  onClick: () => void;
  icon?: IconComponent;
  variant?: "primary" | "secondary";
};

export function GatewaySetupEmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
}: {
  icon: IconComponent;
  title: string;
  description: string;
  actions?: ReadonlyArray<GatewaySetupEmptyStateAction>;
}) {
  return (
    <div className="border-border bg-muted/30 flex flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 py-10 text-center">
      <span className="bg-background flex size-8 items-center justify-center rounded-md border">
        <Icon size="base" color="muted" aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {actions.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              text={action.label}
              icon={action.icon}
              variant={action.variant}
              onClick={() => action.onClick()}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
