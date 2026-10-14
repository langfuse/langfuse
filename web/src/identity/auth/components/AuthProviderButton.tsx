import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { cn } from "@/src/app/utils/tailwind";
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
  return (
    <div>
      <Button
        onClick={onClick}
        variant="secondary"
        loading={loading}
        className="w-full"
      >
        {icon}
        {label}
      </Button>
      <div
        className={cn(
          "text-muted-foreground mt-0.5 text-center text-xs",
          showLastUsedBadge ? "visible" : "invisible",
        )}
      >
        Last used
      </div>
    </div>
  );
}
