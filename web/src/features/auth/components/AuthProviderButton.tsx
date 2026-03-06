import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import React from "react";

interface AuthProviderButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  loading?: boolean;
  showLastUsedBadge?: boolean;
}

export function AuthProviderButton({
  icon,
  label,
  onClick,
  loading = false,
  showLastUsedBadge = false,
}: AuthProviderButtonProps) {
  const shouldShowLastUsedBadge = showLastUsedBadge && !loading;

  return (
    <div className="relative">
      <Button
        onClick={onClick}
        variant="secondary"
        loading={loading}
        className={cn(
          "w-full",
          shouldShowLastUsedBadge && "ring-1 ring-ring/30",
        )}
        title={shouldShowLastUsedBadge ? "Last used" : undefined}
      >
        {icon}
        {label}
        {shouldShowLastUsedBadge ? (
          <span className="sr-only">, last used sign-in method</span>
        ) : null}
      </Button>
      {shouldShowLastUsedBadge ? (
        <Badge
          variant="secondary"
          size="sm"
          aria-hidden="true"
          className="pointer-events-none absolute -right-1 -top-2 border border-border text-[9px] font-medium leading-none ring-2 ring-card"
        >
          Last used
        </Badge>
      ) : null}
    </div>
  );
}
