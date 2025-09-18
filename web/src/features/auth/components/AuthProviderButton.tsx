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
          "mt-0.5 text-center text-xs text-muted-foreground",
          showLastUsedBadge ? "visible" : "invisible",
        )}
      >
        Last used
      </div>
    </div>
  );
}
