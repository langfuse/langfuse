import type { IconComponent } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button as MenuTriggerButton } from "@/src/components/ui/button";

type GatewaySetupEmptyStateAction =
  | {
      type: "button";
      label: string;
      onClick: () => void;
      icon?: IconComponent;
    }
  | {
      type: "menu";
      label: string;
      items: ReadonlyArray<{ id: string; title: string }>;
      onSelect: (id: string) => void;
      disabled?: boolean;
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
          {actions.map((action) =>
            action.type === "menu" ? (
              <MenuAction key={action.label} action={action} />
            ) : (
              <Button
                key={action.label}
                text={action.label}
                icon={action.icon}
                onClick={() => action.onClick()}
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function MenuAction({
  action,
}: {
  action: Extract<GatewaySetupEmptyStateAction, { type: "menu" }>;
}) {
  const isDisabled = action.disabled || action.items.length === 0;
  return (
    <DropdownMenu
      disabled={isDisabled}
      items={action.items.map((item) => ({
        type: "item",
        id: item.id,
        title: item.title,
        onClick: () => action.onSelect(item.id),
      }))}
    >
      {({ getTriggerProps }) => (
        // The design-system Button does not forward floating-ui trigger handlers.
        <MenuTriggerButton
          variant="outline"
          className="gap-1.5"
          disabled={isDisabled}
          {...getTriggerProps()}
        >
          {action.label}
          <DropdownIndicator nudge />
        </MenuTriggerButton>
      )}
    </DropdownMenu>
  );
}
