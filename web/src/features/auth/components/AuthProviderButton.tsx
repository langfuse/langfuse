import { Button } from "@/src/components/ui/button";
import React from "react";
import { LastUsedBubble } from "./LastUsedBubble";

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
      <LastUsedBubble visible={showLastUsedBadge} />
    </div>
  );
}
