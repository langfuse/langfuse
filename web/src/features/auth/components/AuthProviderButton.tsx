import { Button } from "@/src/components/ui/button";
import React from "react";

type NextAuthProvider = NonNullable<Parameters<typeof import("next-auth/react").signIn>[0]>;

interface AuthProviderButtonProps {
  provider: NextAuthProvider;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  loading?: boolean;
  showLastUsedBadge?: boolean;
}

export function AuthProviderButton({
  provider,
  icon,
  label,
  onClick,
  loading = false,
  showLastUsedBadge = false,
}: AuthProviderButtonProps) {
  return (
    <div className="relative">
      <Button
        onClick={onClick}
        variant="secondary"
        loading={loading}
        className="w-full"
      >
        {icon}
        {label}
      </Button>
      {showLastUsedBadge && (
        <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full text-nowrap">
          Last used
        </div>
      )}
    </div>
  );
}