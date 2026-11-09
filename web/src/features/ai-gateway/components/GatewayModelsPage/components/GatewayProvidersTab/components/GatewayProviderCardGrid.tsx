import type { ReactNode } from "react";

export type GatewayProviderCardGridProps = {
  children: ReactNode;
};

export function GatewayProviderCardGrid({
  children,
}: GatewayProviderCardGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
      {children}
    </div>
  );
}
